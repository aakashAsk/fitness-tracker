// Firestore-backed storage for workout plans created in NewPlanModal.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../Firebase/firebaseConfig';
import type { DayKey } from '../Screens/Workout/Types';
import { getCurrentUserId } from './userService';

const PLANS_COLLECTION = 'workoutPlans';

export type WorkoutPlanStatus = 'live' | 'draft' | 'paused';

export interface WorkoutPlanInput {
  name: string;
  muscles: string[];
  exerciseIds: string[];
  days: DayKey[];
  /** e.g. "6:30 PM" — the same time slot on every day in `days`. */
  time: string;
  status: WorkoutPlanStatus;
}

export interface WorkoutPlan extends WorkoutPlanInput {
  id: string;
  userId: string;
  createdAt: Date | null;
}

export class WorkoutPlanServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkoutPlanServiceError';
  }
}

function toWorkoutPlan(id: string, data: Record<string, unknown>): WorkoutPlan {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
  return {
    id,
    name: (data.name as string) ?? '',
    muscles: (data.muscles as string[]) ?? [],
    exerciseIds: (data.exerciseIds as string[]) ?? [],
    days: (data.days as DayKey[]) ?? [],
    // Older docs saved before the time picker was added won't have this.
    time: (data.time as string) ?? '',
    // Older docs predate the status field too — treat them as live.
    status: (data.status as WorkoutPlanStatus) ?? 'live',
    // Older docs predate per-user scoping.
    userId: (data.userId as string) ?? getCurrentUserId(),
    createdAt,
  };
}

/**
 * Parses a "6:30 PM" / "06:05 AM" style string into minutes since midnight,
 * for chronological sorting. Unparseable input sorts to the start of day.
 */
export function parseTimeToMinutes(time: string): number {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  const [, hourStr, minuteStr, period] = match;
  let hour = parseInt(hourStr, 10) % 12;
  if (period.toUpperCase() === 'PM') hour += 12;
  return hour * 60 + parseInt(minuteStr, 10);
}

/** Newest first. A document created moments ago still has a null
 * `createdAt` — serverTimestamp() has not resolved yet — so it sorts to
 * the top rather than the bottom, which is where the user expects the
 * thing they just saved. */
function byNewest(a: { createdAt: Date | null }, b: { createdAt: Date | null }): number {
  return (b.createdAt?.getTime() ?? Infinity) - (a.createdAt?.getTime() ?? Infinity);
}

/** Saves a new workout plan (scoped to the signed-in user) and returns its id. */
export async function createWorkoutPlan(plan: WorkoutPlanInput): Promise<string> {
  try {
    const ref = await addDoc(collection(db, PLANS_COLLECTION), {
      ...plan,
      userId: getCurrentUserId(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    throw new WorkoutPlanServiceError(
      err instanceof Error ? err.message : 'Failed to save the workout plan.',
    );
  }
}

/**
 * One-off fetch of every saved plan for the current user, newest first.
 *
 * Scoped with a Firestore `where` because the security rules require it:
 * a list query is rejected outright unless the rules can prove every
 * result belongs to the caller, so an unscoped query fails with
 * permission-denied no matter what the documents contain.
 *
 * The tradeoff, noted here because it used to be the reason this filter
 * was client-side: an equality filter never matches a document missing
 * the field, so any plan written before per-user scoping — which has no
 * `userId` at all — stops appearing. Those documents need a one-off
 * backfill stamping `userId` onto them.
 *
 * Needs a composite index on (userId ASC, createdAt DESC).
 */
export async function fetchWorkoutPlans(): Promise<WorkoutPlan[]> {
  try {
    const q = query(
      collection(db, PLANS_COLLECTION),
      where('userId', '==', getCurrentUserId()),
    );
    const snapshot = await getDocs(q);
    const userId = getCurrentUserId();
    return snapshot.docs
      .map((d) => toWorkoutPlan(d.id, d.data()))
      .filter((plan) => plan.userId === userId)
      .sort(byNewest);
  } catch (err) {
    throw new WorkoutPlanServiceError(
      err instanceof Error ? err.message : 'Failed to load workout plans.',
    );
  }
}

/**
 * Live subscription to the current user's plans — call the returned
 * function to unsubscribe (e.g. in a useEffect cleanup). See
 * `fetchWorkoutPlans` for why the userId filter is applied client-side.
 */
export function subscribeToWorkoutPlans(
  onChange: (plans: WorkoutPlan[]) => void,
  onError?: (err: WorkoutPlanServiceError) => void,
): () => void {
  const q = query(
    collection(db, PLANS_COLLECTION),
    where('userId', '==', getCurrentUserId()),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const userId = getCurrentUserId();
      onChange(
        snapshot.docs
          .map((d) => toWorkoutPlan(d.id, d.data()))
          .filter((plan) => plan.userId === userId)
          .sort(byNewest),
      );
    },
    (err) => onError?.(new WorkoutPlanServiceError(err.message)),
  );
}

export async function updateWorkoutPlan(
  id: string,
  updates: Partial<WorkoutPlanInput>,
): Promise<void> {
  try {
    await updateDoc(doc(db, PLANS_COLLECTION, id), { ...updates });
  } catch (err) {
    throw new WorkoutPlanServiceError(
      err instanceof Error ? err.message : 'Failed to update the workout plan.',
    );
  }
}

export async function deleteWorkoutPlan(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, PLANS_COLLECTION, id));
  } catch (err) {
    throw new WorkoutPlanServiceError(
      err instanceof Error ? err.message : 'Failed to delete the workout plan.',
    );
  }
}
