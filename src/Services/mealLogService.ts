// Firestore-backed record of meals the user actually ate — the
// nutrition counterpart to workoutLogService, and deliberately the same
// shape so the two behave identically.
//
// One document per (user, meal plan, date), with a deterministic id
// (`${userId}_${planId}_${date}`) so re-logging the same meal on the
// same day overwrites rather than accumulating duplicates. That id
// scheme is also what the security rules pin against, exactly as they
// do for workoutLogs.
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
import type { MealItem, MealType } from './mealPlanService';
import { toMealItem } from './nutritionTotals';

const MEAL_LOGS_COLLECTION = 'mealLogs';

/**
 * Whether the row records a meal that was eaten.
 *
 *  - 'completed' — the user logged it. Real history.
 *  - 'planned'   — the user edited this date's items without logging it
 *                  yet, so the row exists only to say this date differs
 *                  from the recurring plan.
 *
 * Same distinction as WorkoutLogState, for the same reason: anything
 * counting meals eaten has to be able to tell them apart.
 */
export type MealLogState = 'planned' | 'completed';

export interface MealLogInput {
  /** The MealPlan doc id this was logged against. */
  planId: string;
  planName: string;
  mealType: MealType;
  /** "YYYY-MM-DD", local to the device. */
  date: string;
  /** e.g. "8:30 AM" — when it was eaten, which can differ from the plan. */
  time: string;
  items: MealItem[];
  /** Required, with no default, so a call site cannot create a
   * completed-looking row by omission. */
  state: MealLogState;
}

export interface MealLog extends MealLogInput {
  id: string;
  userId: string;
  updatedAt: Date | null;
  /** Total time spent eating, from the dashboard's start/end timer. Absent
      when the meal was never timed. */
  durationSeconds?: number;
}

export class MealLogServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MealLogServiceError';
  }
}

/** Deterministic id for one (user, plan, date). */
export function mealLogDocId(userId: string, planId: string, date: string): string {
  return `${userId}_${planId}_${date}`;
}

function toMealLog(id: string, data: Record<string, unknown>): MealLog {
  return {
    id,
    userId: (data.userId as string) ?? '',
    planId: (data.planId as string) ?? '',
    planName: (data.planName as string) ?? '',
    mealType: (data.mealType as MealType) ?? 'breakfast',
    date: (data.date as string) ?? '',
    time: (data.time as string) ?? '',
    items: ((data.items as unknown[]) ?? []).map(toMealItem),
    // Anything written before `state` existed came from the log button,
    // so a missing field reads as eaten — the same direction
    // workoutLogService defaults in, and for the same reason.
    state: data.state === 'planned' ? 'planned' : 'completed',
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
    ...(typeof data.durationSeconds === 'number' ? { durationSeconds: data.durationSeconds } : {}),
  };
}

/**
 * Records (or overwrites) one meal for one day. `addSeconds` adds timed
 * minutes to whatever the row already holds (it accumulates rather than
 * replaces), for a meal logged from the start/end timer.
 */
export async function saveMealLog(
  input: MealLogInput,
  options?: { addSeconds?: number },
): Promise<void> {
  const userId = getCurrentUserId();
  try {
    await setDoc(
      doc(db, MEAL_LOGS_COLLECTION, mealLogDocId(userId, input.planId, input.date)),
      {
        ...input,
        userId,
        updatedAt: serverTimestamp(),
        ...(options?.addSeconds
          ? { durationSeconds: increment(Math.max(0, Math.round(options.addSeconds))) }
          : {}),
      },
      { merge: true },
    );
    // The day's cached rows no longer match what is stored. Every cached
    // RANGE for this user is dropped too, same reasoning as
    // telemetryService's invalidateTelemetry: a range cache key is the
    // whole (start, end) pair, so there is no cheap way to tell which
    // cached ranges overlap one date, and ranges are read far less often
    // than single days.
    cacheInvalidate(cacheKey(MEAL_LOGS_CACHE, userId, input.date));
    cacheInvalidate(cacheKey(MEAL_LOGS_RANGE_CACHE, userId, ''));
  } catch (err) {
    throw new MealLogServiceError(
      err instanceof Error ? err.message : 'Failed to save the meal log.',
    );
  }
}

/** This user's log for one meal plan on one day, if any. */
export async function fetchMealLog(planId: string, date: string): Promise<MealLog | null> {
  const userId = getCurrentUserId();
  try {
    const snapshot = await getDoc(
      doc(db, MEAL_LOGS_COLLECTION, mealLogDocId(userId, planId, date)),
    );
    if (!snapshot.exists()) return null;
    return toMealLog(snapshot.id, snapshot.data());
  } catch (err) {
    throw new MealLogServiceError(
      err instanceof Error ? err.message : 'Failed to load the meal log.',
    );
  }
}

const MEAL_LOGS_CACHE = 'mealLogs';

/** The date's logs if they were read recently, without a read — `undefined`
 * when not cached. Lets a screen paint from memory on its first frame. */
export function peekMealLogsForDate(date: string): MealLog[] | undefined {
  return cachePeek<MealLog[]>(cacheKey(MEAL_LOGS_CACHE, getCurrentUserId(), date))?.value;
}

/**
 * Every meal this user logged on one date.
 *
 * Served from memory when the date was read recently (see dataCache) —
 * several dashboard sections ask for the same day at once, and it is the
 * same rows each time. `force` reads for real; saveMealLog drops the
 * date's entry itself.
 */
export function fetchMealLogsForDate(
  date: string,
  options?: { force?: boolean },
): Promise<MealLog[]> {
  const userId = getCurrentUserId();
  return cachedFetch(
    cacheKey(MEAL_LOGS_CACHE, userId, date),
    () => loadMealLogsForDate(userId, date),
    options,
  );
}

/**
 * The uncached read.
 *
 * Two equality filters, which Firestore serves from single-field
 * indexes — no composite index needed, unlike an equality paired with
 * an orderBy or range.
 */
async function loadMealLogsForDate(userId: string, date: string): Promise<MealLog[]> {
  try {
    const q = query(
      collection(db, MEAL_LOGS_COLLECTION),
      where('userId', '==', userId),
      where('date', '==', date),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => toMealLog(d.id, d.data()));
  } catch (err) {
    throw new MealLogServiceError(
      err instanceof Error ? err.message : 'Failed to load this day’s meals.',
    );
  }
}

const MEAL_LOGS_RANGE_CACHE = 'mealLogsRange';

/**
 * Every meal log between two dates (inclusive), oldest first.
 *
 * For dashboard widgets that need several days of eating history at
 * once — diet adherence, week-over-week nutrition — rather than one day
 * at a time. The equality filter on `userId` plus the range filter on
 * `date` needs a composite index (see firestore.indexes.json).
 */
export function fetchMealLogsForRange(
  startDate: string,
  endDate: string,
  options?: { force?: boolean },
): Promise<MealLog[]> {
  const userId = getCurrentUserId();
  return cachedFetch(
    cacheKey(MEAL_LOGS_RANGE_CACHE, userId, `${startDate}_${endDate}`),
    () => loadMealLogsForRange(userId, startDate, endDate),
    options,
  );
}

async function loadMealLogsForRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<MealLog[]> {
  try {
    const q = query(
      collection(db, MEAL_LOGS_COLLECTION),
      where('userId', '==', userId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'asc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => toMealLog(d.id, d.data()));
  } catch (err) {
    throw new MealLogServiceError(
      err instanceof Error ? err.message : 'Failed to load your meal history.',
    );
  }
}
