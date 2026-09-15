// Holds the live Firestore meal-plans list so every screen (Nutrition,
// Schedule, ...) reads the same data instead of each running its own
// subscribeToMealPlans() listener. The listener itself is started once,
// from useMealPlansSync() below — this slice only stores what it's told.
//
// Deliberately identical in shape to workoutPlansSlice: the two feeds
// behave the same way, so there is nothing to learn twice.
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { useEffect } from 'react';
import type { MealPlan } from '../Services/mealPlanService';
import { subscribeToMealPlans } from '../Services/mealPlanService';
import { useAppDispatch, useAppSelector } from './hooks';

interface MealPlansState {
  plans: MealPlan[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
}

const initialState: MealPlansState = {
  plans: [],
  status: 'idle',
  error: null,
};

const mealPlansSlice = createSlice({
  name: 'mealPlans',
  initialState,
  reducers: {
    mealPlansLoading(state) {
      state.status = 'loading';
    },
    mealPlansReceived(state, action: PayloadAction<MealPlan[]>) {
      state.plans = action.payload;
      state.status = 'ready';
      state.error = null;
    },
    mealPlansFailed(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.error = action.payload;
    },
  },
});

export const { mealPlansLoading, mealPlansReceived, mealPlansFailed } =
  mealPlansSlice.actions;

export default mealPlansSlice.reducer;

// --- Selectors ----------------------------------------------------------

export const selectMealPlans = (state: { mealPlans: MealPlansState }) =>
  state.mealPlans.plans;

export const selectMealPlansStatus = (state: { mealPlans: MealPlansState }) =>
  state.mealPlans.status;

export const selectMealPlansError = (state: { mealPlans: MealPlansState }) =>
  state.mealPlans.error;

// --- Sync hook ------------------------------------------------------------

/**
 * Starts the single, app-wide Firestore listener and keeps the store in
 * sync with it. Call this ONCE near the root (App.tsx) — every other
 * component just reads `selectMealPlans` and gets updates automatically
 * the moment a plan is created or edited, with no wiring per screen.
 */
export function useMealPlansSync(userId: string | null | undefined) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // See useWorkoutPlansSync — the listener must not start before auth
    // has resolved, or it queries as 'guest-user' and is permanently
    // denied by the security rules.
    if (!userId) return;

    dispatch(mealPlansLoading());
    const unsubscribe = subscribeToMealPlans(
      (plans) => dispatch(mealPlansReceived(plans)),
      (err) => dispatch(mealPlansFailed(err.message)),
    );
    return unsubscribe;
  }, [dispatch, userId]);
}

/** Convenience hook for read-only consumers — just the plans array. */
export function useMealPlans() {
  return useAppSelector(selectMealPlans);
}

/** True until the first snapshot lands — see useWorkoutPlansLoading. */
export function useMealPlansLoading() {
  const status = useAppSelector(selectMealPlansStatus);
  return status === 'idle' || status === 'loading';
}

/** The subscription's error, if it failed. Surfaced by the Nutrition
 * screen so a listener that never connects is visible, rather than
 * looking like a day with no meals planned. */
export function useMealPlansError() {
  return useAppSelector(selectMealPlansError);
}
