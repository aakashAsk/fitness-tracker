// Holds the live Firestore grocery-lists feed so every screen reads the
// same data instead of each running its own subscribeToGroceryLists()
// listener. Deliberately identical in shape to mealPlansSlice/
// workoutPlansSlice: the three feeds behave the same way, so there is
// nothing to learn twice.
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { useEffect } from 'react';
import type { GroceryList } from '../Services/groceryListService';
import { subscribeToGroceryLists } from '../Services/groceryListService';
import { useAppDispatch, useAppSelector } from './hooks';

interface GroceryListsState {
  lists: GroceryList[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
}

const initialState: GroceryListsState = {
  lists: [],
  status: 'idle',
  error: null,
};

const groceryListsSlice = createSlice({
  name: 'groceryLists',
  initialState,
  reducers: {
    groceryListsLoading(state) {
      state.status = 'loading';
    },
    groceryListsReceived(state, action: PayloadAction<GroceryList[]>) {
      state.lists = action.payload;
      state.status = 'ready';
      state.error = null;
    },
    groceryListsFailed(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.error = action.payload;
    },
  },
});

export const { groceryListsLoading, groceryListsReceived, groceryListsFailed } =
  groceryListsSlice.actions;

export default groceryListsSlice.reducer;

// --- Selectors ----------------------------------------------------------

export const selectGroceryLists = (state: { groceryLists: GroceryListsState }) =>
  state.groceryLists.lists;

export const selectGroceryListsStatus = (state: { groceryLists: GroceryListsState }) =>
  state.groceryLists.status;

export const selectGroceryListsError = (state: { groceryLists: GroceryListsState }) =>
  state.groceryLists.error;

// --- Sync hook ------------------------------------------------------------

/**
 * Starts the single, app-wide Firestore listener and keeps the store in
 * sync with it. Call this ONCE near the root (App.tsx) — every other
 * component just reads `selectGroceryLists` and gets updates
 * automatically the moment a list is created or edited.
 */
export function useGroceryListsSync(userId: string | null | undefined) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // See useMealPlansSync — the listener must not start before auth has
    // resolved, or it queries as 'guest-user' and is permanently denied
    // by the security rules.
    if (!userId) return;

    dispatch(groceryListsLoading());
    const unsubscribe = subscribeToGroceryLists(
      (lists) => dispatch(groceryListsReceived(lists)),
      (err) => dispatch(groceryListsFailed(err.message)),
    );
    return unsubscribe;
  }, [dispatch, userId]);
}

/** Convenience hook for read-only consumers — just the lists array. */
export function useGroceryLists() {
  return useAppSelector(selectGroceryLists);
}

/** True until the first snapshot lands. */
export function useGroceryListsLoading() {
  const status = useAppSelector(selectGroceryListsStatus);
  return status === 'idle' || status === 'loading';
}
