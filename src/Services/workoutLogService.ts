// Firestore-backed storage for a user's per-day set/rep/weight log —
// what WorkoutSession's "Save" button writes.
//
// Data shape: one document per (user, plan, date) — not one document
// per exercise — since a save always covers every exercise in a plan
// card at once, and grouping this way makes "what did I log for this
// plan today" a single get() instead of a query. The doc id is
// deterministic (`${userId}_${planId}_${date}`) so re-saving the same
// plan on the same day overwrites the previous entry via setDoc(merge)
// instead of accumulating duplicates.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../Firebase/firebaseConfig';
import { getCurrentUserId } from './userService';
import { cacheInvalidate, cacheKey, cachePeek, cachedFetch } from './dataCache';
import { toWorkoutStats, type WorkoutStats } from './workoutStats';

const LOGS_COLLECTION = 'workoutLogs';
const OCCURRENCES_CACHE = 'occurrences';
const WORKOUT_LOGS_RANGE_CACHE = 'workoutLogsRange';

/** Drops one date's cached occurrences — called by every write below that
 * changes what fetchOccurrencesForDate would return for that date.
 *
 * Also drops every cached RANGE for this user (see telemetryService's
 * invalidateTelemetry: a range cache key is the whole start/end pair, so
 * there is no cheap way to tell which cached ranges cover this date). */
function invalidateOccurrences(userId: string, date: string): void {
  cacheInvalidate(cacheKey(OCCURRENCES_CACHE, userId, date));
  cacheInvalidate(cacheKey(WORKOUT_LOGS_RANGE_CACHE, userId, ''));
}

export interface ExerciseSetEntry {
  reps: number;
  /** kg. */
  weight: number;
}

export interface ExerciseLogEntry {
  exerciseId: string;
  name: string;
  /** One record per set performed, in order — Set 1, Set 2, … */
  sets: ExerciseSetEntry[];
}

/**
 * Whether a row describes a workout that actually happened.
 *
 * A document in this collection is a *materialized occurrence* of a plan
 * on one date, not necessarily a record of a completed session:
 *
 *  - 'completed' — the user entered numbers and hit Save. Real history.
 *  - 'planned'   — the user changed which exercises that particular day
 *                  has, without logging it yet. It exists purely to say
 *                  "this date deviates from the plan's exercise list",
 *                  and must be excluded from anything that counts or
 *                  carries forward real training data.
 *
 * Deliberately NOT called `status`: WorkoutPlan.status is already
 * 'live' | 'draft' | 'paused' and the two would be confused on sight.
 */
export type WorkoutLogState = 'planned' | 'completed';

export interface WorkoutLogInput {
  /** The underlying WorkoutPlan doc id (CalendarEvent.sourceId), not the synthetic event id. */
  planId: string;
  planName: string;
  /** "YYYY-MM-DD", local to the device — matches the date strip's selected day. */
  date: string;
  exercises: ExerciseLogEntry[];
  /**
   * Required, with no default — every call site has to say which kind of
   * row it is writing, so a planned occurrence can never be mistaken for
   * a completed session by omission.
   */
  state: WorkoutLogState;
  /**
   * The estimated benefit numbers for exactly these sets (see
   * workoutStats), stored on the same document so a save writes the
   * numbers and the sets they describe together — they cannot drift
   * apart. Pass null when nothing was performed, which clears any
   * earlier estimate; leave it undefined to keep whatever is stored.
   */
  stats?: WorkoutStats | null;
}

export interface WorkoutLog extends Omit<WorkoutLogInput, 'stats'> {
  id: string;
  userId: string;
  updatedAt: Date | null;
  /** Absent on logs written before stats existed, and on rows that only
      carry a timer or a one-day exercise edit. */
  stats?: WorkoutStats;
  /** Total time spent, from the dashboard's start/end timer. Absent when
      the session was never timed. */
  durationSeconds?: number;
}

export class WorkoutLogServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkoutLogServiceError';
  }
}

function logDocId(userId: string, planId: string, date: string): string {
  return `${userId}_${planId}_${date}`;
}

/**
 * Normalizes a stored exercise entry. Entries written before sets were
 * tracked individually have a set COUNT plus a single reps/weight pair
 * (`{ sets: 3, reps: 8, weight: 60 }`); those get expanded into that
 * many identical set records so everything downstream sees one shape.
 */
function toExerciseLogEntry(raw: Record<string, unknown>): ExerciseLogEntry {
  const rawSets = raw.sets;

  const sets: ExerciseSetEntry[] = Array.isArray(rawSets)
    ? rawSets.map((set) => {
        const entry = (set ?? {}) as Record<string, unknown>;
        return {
          reps: Number(entry.reps) || 0,
          weight: Number(entry.weight) || 0,
        };
      })
    : Array.from({ length: Math.max(Number(rawSets) || 0, 1) }, () => ({
        reps: Number(raw.reps) || 0,
        weight: Number(raw.weight) || 0,
      }));

  return {
    exerciseId: (raw.exerciseId as string) ?? '',
    name: (raw.name as string) ?? '',
    sets,
  };
}

function toWorkoutLog(id: string, data: Record<string, unknown>): WorkoutLog {
  const stats = toWorkoutStats(data.stats);
  return {
    id,
    userId: (data.userId as string) ?? '',
    planId: (data.planId as string) ?? '',
    planName: (data.planName as string) ?? '',
    date: (data.date as string) ?? '',
    exercises: ((data.exercises as Record<string, unknown>[]) ?? []).map(toExerciseLogEntry),
    // NOTE: this default runs the OPPOSITE way to the ones in
    // workoutPlanService (`status ?? 'live'`, `userId ?? currentUser`,
    // which default to the newly-added behaviour). Every document
    // written before `state` existed was produced by the Save button,
    // i.e. a real logged session — so a missing field must read as
    // 'completed'. Defaulting to 'planned' here would silently mark the
    // user's entire training history as never performed.
    state: data.state === 'planned' ? 'planned' : 'completed',
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
    ...(typeof data.durationSeconds === 'number' ? { durationSeconds: data.durationSeconds } : {}),
    ...(stats ? { stats } : {}),
  };
}

/** Formats a Date as "YYYY-MM-DD" in local time (not UTC — avoids an
 * off-by-one-day doc id near midnight in timezones behind UTC). */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today's date key. Compare date keys as strings rather than comparing
 * `Date` objects — a Date carries a time-of-day, so "is the selected day
 * in the past" flips incorrectly as the clock passes the moment the
 * screen was opened. */
export function todayDateKey(): string {
  return toDateKey(new Date());
}

/**
 * Adds a timed session to one plan's log for one day and marks it
 * completed. Time accumulates (`increment`), so two sessions of the same
 * plan on one day add up. Only the duration and state are written, so
 * any sets already logged for the day are left exactly as they are; on a
 * day with no log yet the document is created with no exercises.
 */
export async function logWorkoutSessionTime(input: {
  planId: string;
  planName: string;
  date: string;
  seconds: number;
}): Promise<void> {
  const userId = getCurrentUserId();
  try {
    await setDoc(
      doc(db, LOGS_COLLECTION, logDocId(userId, input.planId, input.date)),
      {
        userId,
        planId: input.planId,
        planName: input.planName,
        date: input.date,
        state: 'completed',
        durationSeconds: increment(Math.max(0, Math.round(input.seconds))),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    invalidateOccurrences(userId, input.date);
  } catch (err) {
    throw new WorkoutLogServiceError(
      err instanceof Error ? err.message : 'Failed to log the workout time.',
    );
  }
}

/** Saves (or overwrites) the set/rep/weight log for one plan on one day. */
export async function saveWorkoutLog(input: WorkoutLogInput): Promise<void> {
  const userId = getCurrentUserId();
  // Split out so an omitted `stats` is left off the write entirely —
  // Firestore rejects an explicit undefined, and null would wipe it.
  const { stats, ...rest } = input;
  try {
    await setDoc(
      doc(db, LOGS_COLLECTION, logDocId(userId, input.planId, input.date)),
      {
        ...rest,
        ...(stats !== undefined ? { stats } : {}),
        userId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    invalidateOccurrences(userId, input.date);
  } catch (err) {
    throw new WorkoutLogServiceError(
      err instanceof Error ? err.message : 'Failed to save the workout log.',
    );
  }
}

/**
 * Records that one date's exercise list deviates from its plan, without
 * touching the plan document — the fix for "editing last Monday rewrote
 * every Monday". The plan stays the recurring rule; this row overrides
 * the rule for this date alone.
 *
 * Two things are preserved rather than clobbered, because this can be
 * called on a day that already has a log:
 *
 *  - Existing sets/reps/weight are carried across for every exercise
 *    that survives the edit, matched by `exerciseId` (never by list
 *    position), so re-ordering or inserting an exercise cannot shift
 *    another exercise's numbers onto the wrong row.
 *  - An already-'completed' row stays 'completed'. Editing which
 *    exercises a finished session contained does not un-finish it.
 *
 * New exercises land with `sets: []` — not a zero-filled set — so they
 * read as "nothing entered" everywhere downstream.
 */
export async function savePlannedOccurrence(input: {
  planId: string;
  planName: string;
  date: string;
  exercises: { exerciseId: string; name: string }[];
}): Promise<void> {
  const userId = getCurrentUserId();
  const ref = doc(db, LOGS_COLLECTION, logDocId(userId, input.planId, input.date));
  try {
    const snapshot = await getDoc(ref);
    const existing = snapshot.exists() ? toWorkoutLog(snapshot.id, snapshot.data()) : null;
    const previousSets = new Map(
      (existing?.exercises ?? []).map((entry) => [entry.exerciseId, entry.sets]),
    );

    await setDoc(
      ref,
      {
        planId: input.planId,
        planName: input.planName,
        date: input.date,
        exercises: input.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          name: exercise.name,
          sets: previousSets.get(exercise.exerciseId) ?? [],
        })),
        state: existing?.state === 'completed' ? 'completed' : 'planned',
        userId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    invalidateOccurrences(userId, input.date);
  } catch (err) {
    throw new WorkoutLogServiceError(
      err instanceof Error ? err.message : 'Failed to save the change for this day.',
    );
  }
}

/**
 * Every materialized occurrence the user has on one date, planned and
 * completed alike.
 *
 * This is what lets the day view survive a plan being rescheduled,
 * paused or deleted after a date was edited: the recurring rule alone
 * can no longer answer "what was on this day", because a plan moved
 * from Mon to Tue stops producing a Monday event even though that
 * Monday's row still exists. The day view unions the two.
 *
 * Served from memory when the date was read recently (see dataCache) —
 * the dashboard's sections and the Workout tab all ask for the same day.
 * `force` reads for real; every write above drops the date's entry.
 */
export function fetchOccurrencesForDate(
  date: string,
  options?: { force?: boolean },
): Promise<WorkoutLog[]> {
  const userId = getCurrentUserId();
  return cachedFetch(
    cacheKey(OCCURRENCES_CACHE, userId, date),
    () => loadOccurrencesForDate(userId, date),
    options,
  );
}

/** The date's occurrences if they were read recently, without a read —
 * `undefined` when not cached. */
export function peekOccurrencesForDate(date: string): WorkoutLog[] | undefined {
  return cachePeek<WorkoutLog[]>(cacheKey(OCCURRENCES_CACHE, getCurrentUserId(), date))?.value;
}

/**
 * The uncached read. Both clauses are equality filters, which Firestore
 * serves from single-field indexes — no composite index needed, unlike
 * an equality plus an `orderBy`/range.
 */
async function loadOccurrencesForDate(userId: string, date: string): Promise<WorkoutLog[]> {
  try {
    const q = query(
      collection(db, LOGS_COLLECTION),
      where('userId', '==', userId),
      where('date', '==', date),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => toWorkoutLog(d.id, d.data()));
  } catch (err) {
    throw new WorkoutLogServiceError(
      err instanceof Error ? err.message : 'Failed to load this day’s workouts.',
    );
  }
}

/** The signed-in user's saved log for one plan on one day, if any —
 * lets a screen prefill previously-entered numbers. */
export async function fetchWorkoutLog(
  planId: string,
  date: string,
): Promise<WorkoutLog | null> {
  const userId = getCurrentUserId();
  try {
    const snapshot = await getDoc(doc(db, LOGS_COLLECTION, logDocId(userId, planId, date)));
    if (!snapshot.exists()) return null;
    return toWorkoutLog(snapshot.id, snapshot.data());
  } catch (err) {
    throw new WorkoutLogServiceError(
      err instanceof Error ? err.message : 'Failed to load the workout log.',
    );
  }
}

/**
 * Every saved log for the signed-in user, most recent first — across
 * every plan, not just one. "What did I last log for exercise X" is a
 * user-wide question: the same exercise (Bench Press, say) can show up
 * in several different plans, and whichever plan it was most recently
 * logged under — 3 days ago on a completely different plan, say — is
 * what should carry forward, not "only within this same plan".
 *
 * Filters by a single `==` clause (no `orderBy`/range), so it doesn't
 * need a composite Firestore index; sorting by `date` (a lexicographic
 * "YYYY-MM-DD" string, so string sort == chronological sort) happens
 * client-side instead.
 */
export async function fetchWorkoutLogsForUser(): Promise<WorkoutLog[]> {
  const userId = getCurrentUserId();
  try {
    const q = query(collection(db, LOGS_COLLECTION), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((d) => toWorkoutLog(d.id, d.data()))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (err) {
    throw new WorkoutLogServiceError(
      err instanceof Error ? err.message : 'Failed to load previous workout logs.',
    );
  }
}

/**
 * Every workout log between two dates (inclusive), oldest first.
 *
 * For dashboard widgets that need several days of training history at
 * once — the net-calories chart, week-over-week burn — rather than one
 * plan/day at a time. Mirrors fetchMealLogsForRange in telemetryService's
 * sibling file exactly, down to the composite index it needs (see
 * firestore.indexes.json).
 */
export function fetchWorkoutLogsForRange(
  startDate: string,
  endDate: string,
  options?: { force?: boolean },
): Promise<WorkoutLog[]> {
  const userId = getCurrentUserId();
  return cachedFetch(
    cacheKey(WORKOUT_LOGS_RANGE_CACHE, userId, `${startDate}_${endDate}`),
    () => loadWorkoutLogsForRange(userId, startDate, endDate),
    options,
  );
}

async function loadWorkoutLogsForRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<WorkoutLog[]> {
  try {
    const q = query(
      collection(db, LOGS_COLLECTION),
      where('userId', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'asc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => toWorkoutLog(d.id, d.data()));
  } catch (err) {
    throw new WorkoutLogServiceError(
      err instanceof Error ? err.message : 'Failed to load your workout history.',
    );
  }
}

/** Key for `ExerciseLogLookup.savedForDate` — an exercise on a
 * particular plan, since the same exercise can sit in two plans that
 * both got logged on the same day. */
export function savedEntryKey(planId: string, exerciseId: string): string {
  return `${planId}::${exerciseId}`;
}

export interface ExerciseLogLookup {
  /**
   * What was actually saved *for the requested date itself* — the
   * day's own record, so revisiting a logged day shows exactly what
   * was logged. Keyed by `savedEntryKey(planId, exerciseId)`.
   */
  savedForDate: Record<string, ExerciseLogEntry>;
  /**
   * The nearest logged entry for each exercise from some *other* day,
   * used to prefill a day that has no log of its own. Prefers the most
   * recent earlier session; where there is none — backfilling a past
   * day after a later one has already been logged — it falls back to
   * the closest later session, so there is always something to work
   * from. Keyed by `exerciseId` alone, because "when did I last do this
   * exercise" is a user-wide question, not a per-plan one.
   */
  nearest: Record<string, ExerciseLogEntry>;
  /**
   * Plan doc ids that have a *completed* log on the requested date.
   *
   * Presence of a row is deliberately not enough: a 'planned' row is
   * written the moment a user edits one day's exercises, so keying the
   * "Logged" badge off row existence would mark a day as finished as
   * soon as it was edited — and, where editing is gated on not being
   * logged, would lock the day against any further edits.
   */
  completedPlanIds: string[];
  /**
   * Every *completed* session for each requested exercise, up to and
   * including `dateKey`, oldest first — the raw material for a progress
   * chart. Keyed by `exerciseId` alone, like `nearest`: how an exercise
   * has progressed is a user-wide question, not a per-plan one.
   *
   * Comes free with the lookup's existing scan, so charting costs no
   * extra reads. Sessions after `dateKey` are excluded so the trend
   * shown while looking at a past day doesn't run into that day's
   * future.
   */
  history: Record<string, ExerciseSessionEntry[]>;
}

export interface ExerciseSessionEntry {
  /** "YYYY-MM-DD" */
  date: string;
  sets: ExerciseSetEntry[];
}

/**
 * Everything a screen needs to fill in sets/reps/weight for one day, in
 * a single query: the day's own saved values where they exist, plus the
 * nearest other day's values for every exercise as a fallback.
 *
 * Matching is strictly by `exerciseId` (never by name or list
 * position), so an exercise that appears in several plans — or a plan
 * whose exercise list has since been edited — can never inherit another
 * exercise's numbers.
 */
export async function fetchExerciseLogLookup(
  exerciseIds: string[],
  dateKey: string,
): Promise<ExerciseLogLookup> {
  if (exerciseIds.length === 0) {
    return { savedForDate: {}, nearest: {}, completedPlanIds: [], history: {} };
  }

  const logs = await fetchWorkoutLogsForUser();
  const wanted = new Set(exerciseIds);
  const savedForDate: Record<string, ExerciseLogEntry> = {};
  const earlier: Record<string, ExerciseLogEntry> = {};
  const later: Record<string, ExerciseLogEntry> = {};
  const completedPlanIds = new Set<string>();
  const history: Record<string, ExerciseSessionEntry[]> = {};

  // Collected newest-first during the walk below, then reversed once at
  // the end — cheaper than unshifting into the front of an array per hit.
  const pushHistory = (log: WorkoutLog) => {
    if (log.state !== 'completed' || log.date > dateKey) return;
    for (const entry of log.exercises) {
      if (!wanted.has(entry.exerciseId)) continue;
      if (entry.sets.length === 0) continue; // nothing performed to plot
      (history[entry.exerciseId] ??= []).push({ date: log.date, sets: entry.sets });
    }
  };

  // `logs` is newest-first, so a single walk gets both: the FIRST
  // earlier hit per exercise is the closest earlier one, while each
  // successive later hit sits closer to dateKey than the last, so
  // overwriting leaves the closest later one.
  for (const log of logs) {
    if (log.date === dateKey) {
      if (log.state === 'completed') completedPlanIds.add(log.planId);
      for (const entry of log.exercises) {
        if (!wanted.has(entry.exerciseId)) continue;
        savedForDate[savedEntryKey(log.planId, entry.exerciseId)] = entry;
      }
      continue;
    }

    // 'planned' rows carry no performed numbers — only a deviating
    // exercise list, with empty sets on anything newly added. Letting
    // them into `nearest` would make "the last time I did bench press"
    // resolve to a day the user never trained, and future-dated rows
    // (a scheduled day edited ahead of time) would win the `later`
    // fallback outright. Only real sessions carry forward.
    if (log.state !== 'completed') continue;

    const isEarlier = log.date < dateKey;
    for (const entry of log.exercises) {
      if (!wanted.has(entry.exerciseId)) continue;
      if (isEarlier) {
        if (earlier[entry.exerciseId]) continue; // keep the closest earlier
        earlier[entry.exerciseId] = entry;
      } else {
        later[entry.exerciseId] = entry;
      }
    }
  }

  // Collected newest-first above; reversed once here rather than
  // unshifting on every hit.
  Object.values(history).forEach((entries) => entries.reverse());

  // An earlier session always wins over a later one where both exist.
  return {
    savedForDate,
    nearest: { ...later, ...earlier },
    completedPlanIds: Array.from(completedPlanIds),
    history,
  };
}
