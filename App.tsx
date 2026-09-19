import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { onAuthStateChanged } from '@firebase/auth';

import DashboardOverview from './src/Screens/Dashboard/LiveTelementry';
import TodaysWorkoutCard from './src/Screens/Dashboard/TodaysWorkout';
import UpcomingMealCard from './src/Screens/Dashboard/UpcomingMealCard';
import AuthNavigator from './src/Screens/Auth/AuthNavigator';
import OnboardingNavigator from './src/Screens/Onboarding/OnboardingNavigator';
import ProfileScreen from './src/Screens/Profile/ProfileScreen';
import SplashScreen from './src/Screens/Splash/SplashScreen';
import {
  selectUserProfile,
  selectUserProfileStatus,
  userProfileReceived,
  useUserProfileSync,
} from './src/Store/userProfileSlice';
import { useAppDispatch, useAppSelector } from './src/Store/hooks';

import { colors } from './src/Theme/colors';
import BottomNavBar, { NavTab } from './src/Components/Navigation';
// Real, Firestore-backed calendar screen — new design temporarily
// replaces this tab with ScheduleSession (a presentational timeline
// UI). Not deleted: re-enable by swapping the import/usage below once
// the new design's data layer is wired up.
// import ScheduleScreen from './src/Screens/ScheduleScreen/Schedule';
import { ScheduleSession } from './src/Screens/ScheduleScreen/ScheduleSession';
// Plan-builder feature — new design temporarily replaces this tab with
// WorkoutSession (a session-logger UI). Not deleted: re-enable by
// swapping the import/usage below once the new design's data layer
// is wired up and the plan builder is reintroduced elsewhere.
// import { WorkoutPlanner } from './src/Screens/Workout/WorkoutPlanner';
import { WorkoutSession } from './src/Screens/Workout/WorkoutSession';
import { NutritionScreen } from './src/Screens/Nutrition/NutritionScreen';
import { store } from './src/Store/store';
import { useWorkoutPlansSync } from './src/Store/workoutPlansSlice';
import { useMealPlansSync } from './src/Store/mealPlansSlice';
import { auth } from './src/Firebase/firebaseConfig';
import { DialogProvider } from './src/Components/Dialog';
import { themedStyles, ThemeProvider, useTheme, useThemeState } from './src/Theme/ThemeContext';
// ── Reminders: temporarily disabled ──────────────────────────────────
// expo-notifications cannot run in Expo Go on Android, so the whole
// feature is commented out rather than half-working while the app is
// developed there. Nothing else references these, so the module is not
// bundled at all while this is off.
//
// To re-enable: uncomment this block and the useReminderSync() call
// below, then run a dev build (npm run build:dev) — Expo Go will not
// deliver notifications however this is configured.
//
import { useReminderSync } from './src/Store/useReminderSync';
import * as Notifications from 'expo-notifications';
//
// Without a handler, a reminder that arrives while the app is open is
// delivered silently — the user sees nothing until they background it.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
// ─────────────────────────────────────────────────────────────────────

function AppContent() {
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  const hasSession = !!firebaseUser;

  // auth.currentUser is null on a cold start even for a user with a
  // stored session — it is only populated once Firebase has restored it.
  // Rendering off `hasSession` alone therefore flashes the sign-in
  // screen before the dashboard. This flag says "Firebase has spoken",
  // and the splash below stays up until it has.
  const [authResolved, setAuthResolved] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, user => {
        setFirebaseUser(user);
        setAuthResolved(true);
      }),
    [],
  );

  // The profile is loaded here, once, and every screen reads it from
  // the store — the dashboard's avatar and greeting, the Profile tab,
  // and the onboarding gate below.
  useUserProfileSync(firebaseUser?.uid);

  const dispatch = useAppDispatch();
  const profile = useAppSelector(selectUserProfile);
  const profileStatus = useAppSelector(selectUserProfileStatus);

  // The device cache has already set the theme by the time anything
  // renders (see useThemeState). This only corrects it against the
  // server — for a user who switched theme on another device — and
  // re-caches the result.
  //
  // Deliberately driven off `profile?.themeMode` and not a selector with
  // a 'light' fallback: while the profile is still loading such a
  // selector reads as light, which would override the cached dark and
  // put the light-splash flash straight back.
  const savedThemeMode = profile?.themeMode ?? null;
  const { mode: themeMode, isDark, setModePersisted: setThemeMode, hydrated } = useTheme();

  useEffect(() => {
    if (savedThemeMode && savedThemeMode !== themeMode) setThemeMode(savedThemeMode);
  }, [savedThemeMode, themeMode, setThemeMode]);

  // Dark surfaces need light status-bar glyphs, and vice versa.
  const statusBarStyle = isDark ? 'light-content' : 'dark-content';

  // Still loading is what keeps a returning user from seeing step 1
  // flash before the read comes back.
  const profileLoading = profileStatus === 'idle' || profileStatus === 'loading';

  // A failed read must not lock the user out of the app, and it must not
  // re-run onboarding for someone who already did it — that would
  // overwrite their real answers with defaults. So only a read that
  // actually succeeded and found nothing sends them to onboarding.
  const needsOnboarding = profileStatus === 'ready' && !profile?.onboardingCompleted;

  // ── Boot gate ──────────────────────────────────────────────────────
  // The splash comes down when the animation has finished AND the app
  // knows which screen it is about to show. A signed-out user has no
  // profile to wait for, so only a session makes the profile read part
  // of "ready" — otherwise the splash would never end for them.
  const [splashAnimationDone, setSplashAnimationDone] = useState(false);
  const [bootComplete, setBootComplete] = useState(false);

  const appReady = authResolved && (!hasSession || !profileLoading);

  // Latched rather than derived: a later profile refetch flips
  // profileLoading back on, and without this the splash would reappear
  // mid-session.
  useEffect(() => {
    if (splashAnimationDone && appReady) setBootComplete(true);
  }, [splashAnimationDone, appReady]);

  // One Firestore listener per collection for the whole app — every
  // screen reads the result from the Redux store instead of subscribing
  // individually. Started only once the uid is known: the queries filter
  // on it, and the security rules reject them without it.
  useWorkoutPlansSync(firebaseUser?.uid);
  useMealPlansSync(firebaseUser?.uid);

  // Reschedules the device's reminders whenever a plan changes.
  // Disabled with the import above — see the note at the top of the file.
  useReminderSync(hasSession);

  const [activeTab, setActiveTab] = useState<NavTab>('home');

  // A plan the next tab should scroll to — set when a dashboard card
  // sends the user to its session. Cleared once the tab has landed, so
  // returning to that tab later from the nav bar opens at the top as usual.
  const [focusPlanId, setFocusPlanId] = useState<string | null>(null);
  const openPlanInTab = (tab: 'workout' | 'nutrition', planId: string) => {
    setFocusPlanId(planId);
    setActiveTab(tab);
  };
  const clearFocus = () => setFocusPlanId(null);

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <DashboardOverview onProfilePress={() => setActiveTab('profile')} />
            <TodaysWorkoutCard
              onOpenWorkout={(planId) => openPlanInTab('workout', planId)}
              onViewAll={() => setActiveTab('workout')}
            />
            <UpcomingMealCard
              onOpenMeal={(planId) => openPlanInTab('nutrition', planId)}
              onViewAll={() => setActiveTab('nutrition')}
            />
          </ScrollView>
        );

      case 'workout':
        // return <WorkoutPlanner />;
        return (
          <View style={styles.tabContent}>
            <WorkoutSession focusPlanId={focusPlanId} onFocusHandled={clearFocus} />
          </View>
        );

      case 'nutrition':
        return (
          <View style={styles.tabContent}>
            <NutritionScreen focusPlanId={focusPlanId} onFocusHandled={clearFocus} />
          </View>
        );

      case 'schedule':
        // return <ScheduleScreen />;
        return (
          <View style={styles.tabContent}>
            <ScheduleSession />
          </View>
        );

      case 'profile':
        return (
          <View style={styles.tabContent}>
            <ProfileScreen />
          </View>
        );

      default:
        return null;
    }
  };

  // Ahead of even the splash. Painting before the cached theme has been
  // read would show a dark-mode user a light splash for a frame, which
  // is the exact flash this cache exists to remove. It is one
  // AsyncStorage read, and the OS splash still covers the gap.
  if (!hydrated) return null;

  // Until this clears we do not yet know whether the next screen is
  // sign-in, onboarding or the dashboard.
  if (!bootComplete) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={colors.background} />
        <SplashScreen onFinish={() => setSplashAnimationDone(true)} />
      </SafeAreaView>
    );
  }

  if (!hasSession) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={colors.background} />
        <AuthNavigator />
      </SafeAreaView>
    );
  }

  // Signed in, but we do not yet know whether this account has a
  // profile. Rendering the dashboard here would show a user their
  // targets and then yank them into onboarding a moment later.
  if (profileLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.centered]}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={colors.background} />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // First registration only — once the profile is written this branch
  // is never taken again, and later edits happen from the Profile tab.
  if (needsOnboarding) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={colors.background} />
        {/* The saved profile goes straight into the store, so the
            dashboard behind this already has it when we fall through. */}
        <OnboardingNavigator onComplete={saved => dispatch(userProfileReceived(saved))} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.background} />

      <View style={styles.content}>{renderScreen()}</View>

      <BottomNavBar activeTab={activeTab} onTabPress={setActiveTab} />
    </SafeAreaView>
  );
}

export default function App() {
  // The active theme is held HERE, in the root component, and not in a
  // provider wrapping opaque children. Screens do not subscribe to the
  // theme — they read module-level `styles` objects that themedStyles
  // rebuilds behind their backs — so a switch only reaches them if the
  // whole tree re-renders. A provider re-rendering with a `children`
  // element it received unchanged would not do that; root state does.
  const theme = useThemeState();

  return (
    <Provider store={store}>
      <ThemeProvider value={theme}>
        {/* SafeAreaProvider is outermost on purpose: DialogProvider and
            the modal sheets below it call useSafeAreaInsets(), which
            throws unless a provider is an ancestor. It used to live
            inside AppContent — i.e. below the dialog host. */}
        <SafeAreaProvider style={styles.safeArea}>
          {/* One dialog host for the whole app — screens call useDialog()
              instead of Alert.alert so confirmations match the app's own
              surfaces rather than the platform's. */}
          <DialogProvider>
            <AppContent />
          </DialogProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </Provider>
  );
}

const styles = themedStyles(() => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    flex: 1,
  },

  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabContent: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 8,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    // The nav bar is a sibling in normal flow, not a floating overlay,
    // so it already occupies its own height — this only needs an
    // ordinary gap above it.
    paddingBottom: 24,
    gap: 24,
  },
}));