// The signed-in user's profile, loaded once per session and read from
// everywhere — the dashboard's avatar and greeting, the Profile tab,
// and App.tsx's onboarding gate.
//
// Unlike workoutPlansSlice and mealPlansSlice this is a one-shot fetch
// rather than a live listener. A profile changes only when the user
// themselves changes it, from one screen, in this app — so a permanent
// Firestore subscription would spend a connection watching for events
// that only ever originate here. The writer dispatches the change
// instead (see userPhotoUpdated).
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { useCallback, useEffect } from 'react';
import type { UserProfile } from '../Services/userProfileService';
import { fetchUserProfile } from '../Services/userProfileService';
import { useAppDispatch, useAppSelector } from './hooks';

interface UserProfileState {
  profile: UserProfile | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
}

const initialState: UserProfileState = {
  profile: null,
  status: 'idle',
  error: null,
};

const userProfileSlice = createSlice({
  name: 'userProfile',
  initialState,
  reducers: {
    userProfileLoading(state) {
      state.status = 'loading';
    },
    userProfileReceived(state, action: PayloadAction<UserProfile | null>) {
      state.profile = action.payload;
      state.status = 'ready';
      state.error = null;
    },
    userProfileFailed(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.error = action.payload;
    },
    /** Patches in a newly uploaded picture without a re-read: the URL
        just written is exactly what a refetch would return. */
    userPhotoUpdated(state, action: PayloadAction<string>) {
      if (state.profile) state.profile.photoURL = action.payload;
    },
    /** On sign-out, so the next account never sees the previous one's
        avatar during its own load. */
    userProfileCleared() {
      return initialState;
    },
  },
});

export const {
  userProfileLoading,
  userProfileReceived,
  userProfileFailed,
  userPhotoUpdated,
  userProfileCleared,
} = userProfileSlice.actions;

export default userProfileSlice.reducer;

// --- Selectors ----------------------------------------------------------

export const selectUserProfile = (state: { userProfile: UserProfileState }) =>
  state.userProfile.profile;

export const selectUserProfileStatus = (state: { userProfile: UserProfileState }) =>
  state.userProfile.status;

export const selectUserProfileError = (state: { userProfile: UserProfileState }) =>
  state.userProfile.error;

export const selectUserPhotoUrl = (state: { userProfile: UserProfileState }) =>
  state.userProfile.profile?.photoURL ?? null;

// --- Sync hook ------------------------------------------------------------

/**
 * Loads the profile once for the signed-in user. Call this ONCE near the
 * root (App.tsx); every other screen reads the selectors above.
 *
 * Re-runs when the uid changes so signing into a different account does
 * not keep showing the previous one's data.
 */
export function useUserProfileSync(userId: string | null | undefined) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Same reason as the other sync hooks: before auth resolves,
    // getCurrentUserId() falls back to 'guest-user' and the read is
    // denied by the security rules.
    if (!userId) {
      dispatch(userProfileCleared());
      return;
    }

    let active = true;
    dispatch(userProfileLoading());

    fetchUserProfile(userId)
      .then(profile => {
        if (active) dispatch(userProfileReceived(profile));
      })
      .catch(error => {
        if (active) dispatch(userProfileFailed((error as Error).message));
      });

    return () => {
      active = false;
    };
  }, [dispatch, userId]);
}

/** The profile itself — null while loading, or if the user has none. */
export function useUserProfile() {
  return useAppSelector(selectUserProfile);
}

/** Re-reads the profile from Firestore, for pull-to-refresh and for
    retrying after a failed load. */
export function useRefreshUserProfile() {
  const dispatch = useAppDispatch();

  return useCallback(async () => {
    dispatch(userProfileLoading());
    try {
      dispatch(userProfileReceived(await fetchUserProfile()));
    } catch (error) {
      dispatch(userProfileFailed((error as Error).message));
    }
  }, [dispatch]);
}
