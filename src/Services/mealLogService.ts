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
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../Firebase/firebaseConfig';
import { getCurrentUserId } from './userService';
import type { MealItem, MealType } from './mealPlanService';

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

function toMealItem(raw: unknown): MealItem {
  const entry = (raw ?? {}) as Record<string, unknown>;
  return {
    name: (entry.name as string) ?? '',
    quantity: entry.quantity == null ? '' : String(entry.quantity),
    unit: (entry.unit as string) ?? '',
  };
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
  };
}

/** Records (or overwrites) one meal for one day. */
export async function saveMealLog(input: MealLogInput): Promise<void> {
  const userId = getCurrentUserId();
  try {
    await setDoc(
      doc(db, MEAL_LOGS_COLLECTION, mealLogDocId(userId, input.planId, input.date)),
      { ...input, userId, updatedAt: serverTimestamp() },
      { merge: true },
    );
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

/**
 * Every meal this user logged on one date.
 *
 * Two equality filters, which Firestore serves from single-field
 * indexes — no composite index needed, unlike an equality paired with
 * an orderBy or range.
 */
export async function fetchMealLogsForDate(date: string): Promise<MealLog[]> {
  const userId = getCurrentUserId();
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
