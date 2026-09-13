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
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../Firebase/firebaseConfig';
import { getCurrentUserId } from './userService';

const LOGS_COLLECTION = 'workoutLogs';

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

export interface WorkoutLogInput {
  /** The underlying WorkoutPlan doc id (CalendarEvent.sourceId), not the synthetic event id. */
  planId: string;
  planName: string;
  /** "YYYY-MM-DD", local to the device — matches the date strip's selected day. */
  date: string;
  exercises: ExerciseLogEntry[];
}

export interface WorkoutLog extends WorkoutLogInput {
  id: string;
  userId: string;
  updatedAt: Date | null;
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
  return {
    id,
    userId: (data.userId as string) ?? '',
    planId: (data.planId as string) ?? '',
    planName: (data.planName as string) ?? '',
    date: (data.date as string) ?? '',
    exercises: ((data.exercises as Record<string, unknown>[]) ?? []).map(toExerciseLogEntry),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
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

/** Saves (or overwrites) the set/rep/weight log for one plan on one day. */
export async function saveWorkoutLog(input: WorkoutLogInput): Promise<void> {
  const userId = getCurrentUserId();
  try {
    await setDoc(
      doc(db, LOGS_COLLECTION, logDocId(userId, input.planId, input.date)),
      {
        ...input,
        userId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    throw new WorkoutLogServiceError(
      err instanceof Error ? err.message : 'Failed to save the workout log.',
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
  if (exerciseIds.length === 0) return { savedForDate: {}, nearest: {} };

  const logs = await fetchWorkoutLogsForUser();
  const wanted = new Set(exerciseIds);
  const savedForDate: Record<string, ExerciseLogEntry> = {};
  const earlier: Record<string, ExerciseLogEntry> = {};
  const later: Record<string, ExerciseLogEntry> = {};

  // `logs` is newest-first, so a single walk gets both: the FIRST
  // earlier hit per exercise is the closest earlier one, while each
  // successive later hit sits closer to dateKey than the last, so
  // overwriting leaves the closest later one.
  for (const log of logs) {
    if (log.date === dateKey) {
      for (const entry of log.exercises) {
        if (!wanted.has(entry.exerciseId)) continue;
        savedForDate[savedEntryKey(log.planId, entry.exerciseId)] = entry;
      }
      continue;
    }

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

  // An earlier session always wins over a later one where both exist.
  return { savedForDate, nearest: { ...later, ...earlier } };
}
