// Firestore-backed storage for grocery lists — the same shape family as
// mealPlanService/workoutPlanService, trimmed to what a shopping list
// actually needs: a name and a set of items. No days, no time, no
// status — a grocery list is not a recurring schedule, just a one-off
// list of things to buy.
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
import { getCurrentUserId } from './userService';

const GROCERY_LISTS_COLLECTION = 'groceryLists';

export interface GroceryItem {
  name: string;
  /** Kept as a string, same reasoning as MealItem: users type "1/2" or
   * "2 dozen" as readily as "2". */
  quantity: string;
  unit: string;
  /** Ticked off while shopping. Absent on a freshly created list. */
  checked?: boolean;
}

export interface GroceryListInput {
  name: string;
  items: GroceryItem[];
}

export interface GroceryList extends GroceryListInput {
  id: string;
  userId: string;
  createdAt: Date | null;
}

export class GroceryListServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroceryListServiceError';
  }
}

function toGroceryItem(raw: unknown): GroceryItem {
  const entry = (raw ?? {}) as Record<string, unknown>;
  return {
    name: (entry.name as string) ?? '',
    quantity: entry.quantity == null ? '' : String(entry.quantity),
    unit: (entry.unit as string) ?? '',
    ...(entry.checked === true ? { checked: true } : {}),
  };
}

function toGroceryList(id: string, data: Record<string, unknown>): GroceryList {
  return {
    id,
    name: (data.name as string) ?? '',
    items: ((data.items as unknown[]) ?? []).map(toGroceryItem),
    userId: (data.userId as string) ?? getCurrentUserId(),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
  };
}

/** Newest first. A document created moments ago still has a null
 * `createdAt` — serverTimestamp() has not resolved yet — so it sorts to
 * the top rather than the bottom, matching workoutPlanService/
 * mealPlanService's own byNewest. */
function byNewest(a: { createdAt: Date | null }, b: { createdAt: Date | null }): number {
  return (b.createdAt?.getTime() ?? Infinity) - (a.createdAt?.getTime() ?? Infinity);
}

/** Saves a new grocery list for the signed-in user; returns its doc id. */
export async function createGroceryList(list: GroceryListInput): Promise<string> {
  try {
    const ref = await addDoc(collection(db, GROCERY_LISTS_COLLECTION), {
      ...list,
      userId: getCurrentUserId(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    throw new GroceryListServiceError(
      err instanceof Error ? err.message : 'Failed to save the grocery list.',
    );
  }
}

/**
 * Live subscription to the current user's grocery lists, newest first.
 * Call the returned function to unsubscribe. No display screen reads
 * this yet — see GroceryListModal — but it's here so one can be added
 * without a second pass through the data layer.
 */
export function subscribeToGroceryLists(
  onChange: (lists: GroceryList[]) => void,
  onError?: (err: GroceryListServiceError) => void,
): () => void {
  const q = query(
    collection(db, GROCERY_LISTS_COLLECTION),
    where('userId', '==', getCurrentUserId()),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const userId = getCurrentUserId();
      onChange(
        snapshot.docs
          .map((d) => toGroceryList(d.id, d.data()))
          .filter((list) => list.userId === userId)
          .sort(byNewest),
      );
    },
    (err) => onError?.(new GroceryListServiceError(err.message)),
  );
}

export async function updateGroceryList(
  id: string,
  updates: Partial<GroceryListInput>,
): Promise<void> {
  try {
    await updateDoc(doc(db, GROCERY_LISTS_COLLECTION, id), { ...updates });
  } catch (err) {
    throw new GroceryListServiceError(
      err instanceof Error ? err.message : 'Failed to update the grocery list.',
    );
  }
}

export async function deleteGroceryList(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, GROCERY_LISTS_COLLECTION, id));
  } catch (err) {
    throw new GroceryListServiceError(
      err instanceof Error ? err.message : 'Failed to delete the grocery list.',
    );
  }
}

/** One-off fetch, for a screen that does not want a live subscription. */
export async function fetchGroceryLists(): Promise<GroceryList[]> {
  try {
    const q = query(
      collection(db, GROCERY_LISTS_COLLECTION),
      where('userId', '==', getCurrentUserId()),
    );
    const snapshot = await getDocs(q);
    const userId = getCurrentUserId();
    return snapshot.docs
      .map((d) => toGroceryList(d.id, d.data()))
      .filter((list) => list.userId === userId)
      .sort(byNewest);
  } catch (err) {
    throw new GroceryListServiceError(
      err instanceof Error ? err.message : 'Failed to load grocery lists.',
    );
  }
}
