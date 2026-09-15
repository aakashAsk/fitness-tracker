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
export function useWorkoutPlansSync(userId: string | null | undefined) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Wait for auth to resolve. Firebase restores the session from
    // AsyncStorage asynchronously, so on the first render
    // auth.currentUser is still null — getCurrentUserId() would return
    // 'guest-user', the query would filter on that, and the security
    // rules would reject it outright. The listener is created once, so
    // that failure would then be permanent.
    if (!userId) return;

    dispatch(workoutPlansLoading());
    const unsubscribe = subscribeToWorkoutPlans(
      (plans) => dispatch(workoutPlansReceived(plans)),
      (err) => dispatch(workoutPlansFailed(err.message)),
    );
    // Keyed on the uid, so signing in as someone else re-subscribes
    // instead of leaving the previous account's plans on screen.
    return unsubscribe;
  }, [dispatch, userId]);
}

/** Convenience hook for read-only consumers — just the plans array. */
export function useWorkoutPlans() {
  return useAppSelector(selectWorkoutPlans);
}

/** True until the first snapshot lands. An empty plans array means
 * nothing on its own — it is the initial state as well as the state of a
 * user with no plans — so anything that renders an empty message has to
 * check this first. */
export function useWorkoutPlansLoading() {
  const status = useAppSelector(selectWorkoutPlansStatus);
  return status === 'idle' || status === 'loading';
}
