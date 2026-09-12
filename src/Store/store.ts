import { configureStore } from '@reduxjs/toolkit';
import workoutPlansReducer from './workoutPlansSlice';

export const store = configureStore({
  reducer: {
    workoutPlans: workoutPlansReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // WorkoutPlan.createdAt is a real Date (converted from a Firestore
      // Timestamp in workoutPlanService) — exempt it instead of
      // serializing/deserializing on every snapshot.
      serializableCheck: {
        ignoredPaths: ['workoutPlans.plans'],
        ignoredActionPaths: ['payload'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
