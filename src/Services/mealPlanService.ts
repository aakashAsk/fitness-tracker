// Firestore-backed storage for meal plans — the nutrition-side
// counterpart to workoutPlanService, and deliberately the same shape:
// a plan is a recurring rule (which weekdays, what time), not a single
// dated entry, so the nutrition tab can expand it onto a date the same
// way the workout tab does.
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

const MEAL_PLANS_COLLECTION = 'mealPlans';

export type MealType =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snack'
  | 'pre-workout'
  | 'post-workout'
  | 'supplement';

export const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
  { key: 'pre-workout', label: 'Pre-Workout' },
  { key: 'post-workout', label: 'Post-Workout' },
  { key: 'supplement', label: 'Supplement' },
];

/**
 * The time a meal type usually happens, used to prefill the picker when
 * the user chooses that type. Only a starting point — the dial is still
 * there, and once it has been touched these stop overriding it.
 *
 * Partial on purpose: the types left out have no time that holds for
 * everyone. A pre-workout meal depends on when you train, and a
 * supplement on what it is, so guessing would move the dial to a number
 * that is wrong more often than right. Picking one of those leaves the
 * time exactly as it was.
 */
export const DEFAULT_MEAL_TIME: Partial<Record<MealType, string>> = {
  breakfast: '8:00 AM',
  lunch: '1:00 PM',
  dinner: '6:00 PM',
  snack: '4:00 PM',
};

export const MEAL_TYPE_LABEL: Record<MealType, string> = MEAL_TYPES.reduce(
  (acc, entry) => ({ ...acc, [entry.key]: entry.label }),
  {} as Record<MealType, string>,
);

/** One food in a meal — "Oats", "80", "g". */
export interface MealItem {
  name: string;
  /** Kept as a string: users type "1/2" or "2 scoops" as readily as "80". */
  quantity: string;
  /** g, ml, scoop, piece… */
  unit: string;
}

export type MealPlanStatus = 'live' | 'draft' | 'paused';

export interface MealPlanInput {
  name: string;
  mealType: MealType;
  items: MealItem[];
  days: DayKey[];
  /** e.g. "8:30 AM" — the same slot on every day in `days`. */
  time: string;
  status: MealPlanStatus;
}

export interface MealPlan extends MealPlanInput {
  id: string;
  userId: string;
  createdAt: Date | null;
}

export class MealPlanServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MealPlanServiceError';
  }
}

function toMealItem(raw: unknown): MealItem {
  const entry = (raw ?? {}) as Record<string, unknown>;
  return {
    name: (entry.name as string) ?? '',
    quantity: entry.quantity == null ? '' : String(entry.quantity),
    unit: (entry.unit as string) ?? '',
  };
}

function toMealPlan(id: string, data: Record<string, unknown>): MealPlan {
  return {
    id,
    name: (data.name as string) ?? '',
    mealType: (data.mealType as MealType) ?? 'breakfast',
    items: ((data.items as unknown[]) ?? []).map(toMealItem),
    days: (data.days as DayKey[]) ?? [],
    time: (data.time as string) ?? '',
    status: (data.status as MealPlanStatus) ?? 'live',
    userId: (data.userId as string) ?? getCurrentUserId(),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
  };
}

/** Newest first. A document created moments ago still has a null
 * `createdAt` — serverTimestamp() has not resolved yet — so it sorts to
 * the top rather than the bottom, which is where the user expects the
 * thing they just saved. */
function byNewest(a: { createdAt: Date | null }, b: { createdAt: Date | null }): number {
  return (b.createdAt?.getTime() ?? Infinity) - (a.createdAt?.getTime() ?? Infinity);
}

/** Saves a new meal plan for the signed-in user; returns its doc id. */
export async function createMealPlan(plan: MealPlanInput): Promise<string> {
  try {
    const ref = await addDoc(collection(db, MEAL_PLANS_COLLECTION), {
      ...plan,
      userId: getCurrentUserId(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    throw new MealPlanServiceError(
      err instanceof Error ? err.message : 'Failed to save the meal plan.',
    );
  }
}

/**
 * Live subscription to the current user's meal plans, newest first.
 * Call the returned function to unsubscribe.
 *
 * Scoped with a Firestore `where` because the security rules require
 * it: a list query is rejected outright unless the rules can prove
 * every result belongs to the caller. The client-side filter below is
 * kept as a second line of defence, not as the primary scoping.
 *
 * Needs a composite index on (userId ASC, createdAt DESC).
 */
export function subscribeToMealPlans(
  onChange: (plans: MealPlan[]) => void,
  onError?: (err: MealPlanServiceError) => void,
): () => void {
  const q = query(
    collection(db, MEAL_PLANS_COLLECTION),
    where('userId', '==', getCurrentUserId()),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const userId = getCurrentUserId();
      onChange(
        snapshot.docs
          .map((d) => toMealPlan(d.id, d.data()))
          .filter((plan) => plan.userId === userId)
          .sort(byNewest),
      );
    },
    (err) => onError?.(new MealPlanServiceError(err.message)),
  );
}

/** One-off fetch of every meal plan for the current user. */
export async function fetchMealPlans(): Promise<MealPlan[]> {
  try {
    const q = query(
      collection(db, MEAL_PLANS_COLLECTION),
      where('userId', '==', getCurrentUserId()),
    );
    const snapshot = await getDocs(q);
    const userId = getCurrentUserId();
    return snapshot.docs
      .map((d) => toMealPlan(d.id, d.data()))
      .filter((plan) => plan.userId === userId)
      .sort(byNewest);
  } catch (err) {
    throw new MealPlanServiceError(
      err instanceof Error ? err.message : 'Failed to load meal plans.',
    );
  }
}

export async function updateMealPlan(
  id: string,
  updates: Partial<MealPlanInput>,
): Promise<void> {
  try {
    await updateDoc(doc(db, MEAL_PLANS_COLLECTION, id), { ...updates });
  } catch (err) {
    throw new MealPlanServiceError(
      err instanceof Error ? err.message : 'Failed to update the meal plan.',
    );
  }
}

export async function deleteMealPlan(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, MEAL_PLANS_COLLECTION, id));
  } catch (err) {
    throw new MealPlanServiceError(
      err instanceof Error ? err.message : 'Failed to delete the meal plan.',
    );
  }
}

const WEEKDAY_BY_INDEX: DayKey[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The live meal plans scheduled on `date`'s weekday, for this user. */
export function getMealPlansForDate(date: Date, plans: MealPlan[]): MealPlan[] {
  const weekday = WEEKDAY_BY_INDEX[date.getDay()];
  const userId = getCurrentUserId();
  return plans.filter(
    (plan) =>
      plan.userId === userId && plan.status === 'live' && plan.days.includes(weekday),
  );
}

/** "80 g • 2 scoops" — the item summary shown on a meal card. */
export function describeItems(items: MealItem[]): string {
  const described = items
    .filter((item) => item.name.trim())
    .map((item) => {
      const amount = [item.quantity.trim(), item.unit.trim()].filter(Boolean).join(' ');
      return amount ? `${item.name.trim()} (${amount})` : item.name.trim();
    });
  return described.length > 0 ? described.join(', ') : 'No items added';
}
