// Holds the live Firestore workout-plans list so every screen (WorkoutPlanner,
// Schedule, ...) reads the same data instead of each running its own
// subscribeToWorkoutPlans() listener. The listener itself is started once,
// from useWorkoutPlansSync() below — this slice only stores what it's told.
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { useEffect } from 'react';
import type { WorkoutPlan } from '../Services/workoutPlanService';
import { subscribeToWorkoutPlans } from '../Services/workoutPlanService';
import { useAppDispatch, useAppSelector } from './hooks';

interface WorkoutPlansState {
  plans: WorkoutPlan[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
}

const initialState: WorkoutPlansState = {
  plans: [],
  status: 'idle',
  error: null,
};

const workoutPlansSlice = createSlice({
  name: 'workoutPlans',
  initialState,
  reducers: {
    workoutPlansLoading(state) {
      state.status = 'loading';
    },
    workoutPlansReceived(state, action: PayloadAction<WorkoutPlan[]>) {
      state.plans = action.payload;
      state.status = 'ready';
      state.error = null;
    },
    workoutPlansFailed(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.error = action.payload;
    },
  },
});

export const { workoutPlansLoading, workoutPlansReceived, workoutPlansFailed } =
  workoutPlansSlice.actions;

export default workoutPlansSlice.reducer;

// --- Selectors ----------------------------------------------------------

export const selectWorkoutPlans = (state: { workoutPlans: WorkoutPlansState }) =>
  state.workoutPlans.plans;

export const selectWorkoutPlansStatus = (state: { workoutPlans: WorkoutPlansState }) =>
  state.workoutPlans.status;

export const selectWorkoutPlansError = (state: { workoutPlans: WorkoutPlansState }) =>
  state.workoutPlans.error;

// --- Sync hook ------------------------------------------------------------

/**
 * Starts the single, app-wide Firestore listener and keeps the store in
 * sync with it. Call this ONCE near the root (App.tsx) — every other
 * component just reads `selectWorkoutPlans` via useAppSelector and gets
 * updates automatically whenever a plan is created, edited, or its status
 * changes, with no extra wiring per screen.
 */
export function useWorkoutPlansSync() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(workoutPlansLoading());
    const unsubscribe = subscribeToWorkoutPlans(
      (plans) => dispatch(workoutPlansReceived(plans)),
      (err) => dispatch(workoutPlansFailed(err.message)),
    );
    return unsubscribe;
  }, [dispatch]);
}

/** Convenience hook for read-only consumers — just the plans array. */
export function useWorkoutPlans() {
  return useAppSelector(selectWorkoutPlans);
}
