import { configureStore } from '@reduxjs/toolkit';
import workoutPlansReducer from './workoutPlansSlice';
import mealPlansReducer from './mealPlansSlice';
import groceryListsReducer from './groceryListsSlice';
import userProfileReducer from './userProfileSlice';

export const store = configureStore({
  reducer: {
    workoutPlans: workoutPlansReducer,
    mealPlans: mealPlansReducer,
    groceryLists: groceryListsReducer,
    userProfile: userProfileReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // WorkoutPlan.createdAt and MealPlan.createdAt are real Dates
      // (converted from Firestore Timestamps in their services) — exempt
      // them instead of serializing/deserializing on every snapshot.
      serializableCheck: {
        ignoredPaths: [
          'workoutPlans.plans',
          'mealPlans.plans',
          // GroceryList.createdAt is a real Date for the same reason.
          'groceryLists.lists',
          // UserProfile.createdAt / updatedAt are Dates for the same
          // reason.
          'userProfile.profile',
        ],
        ignoredActionPaths: ['payload'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
