import React, { useCallback, useEffect, useState } from 'react';
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
import TodaysScheduleSlider from './src/Screens/Dashboard/TodaysScheduleSlider';
import SubscriptionAdBanner from './src/Screens/Dashboard/SubscriptionAdBanner';
import DashboardLoadGate, { resetDashboardGate } from './src/Screens/Dashboard/DashboardLoadGate';
import { resetDismissedEvents } from './src/Screens/Dashboard/UpcomingEventsSection';
import DashboardSkeleton from './src/Screens/Dashboard/DashboardSkeleton';
import { resetScreenGates } from './src/Components/ScreenLoadGate';
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
import AppTopBar from './src/Components/AppTopBar';
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
import { cacheClear } from './src/Services/dataCache';
import { resetTelemetryThrottle } from './src/Services/telemetryService';
import { DialogProvider } from './src/Components/Dialog';
import { FeatureFlagProvider, FeatureGate, useFeatureFlagsReady } from './src/FeatureFlags';
import { themedStyles, ThemeProvider, useTheme, useThemeState } from './src/Theme/ThemeContext';
import { NotificationsRoot } from './src/Notifications/NotificationsRoot';
import { useHardwareBack, useRootHardwareBackHandler } from './src/Hooks/useHardwareBack';

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
        // Signed out: forget everything read for that account, so the next
        // one starts clean and sees the dashboard's first-load skeleton.
        // (Cache keys carry the uid, so nothing could leak across
        // accounts anyway — this is about not holding it, and about the
        // skeleton.) The telemetry throttle is cleared for the same
        // reason: its own docs say it is for sign-out, and nothing did.
        if (!user) {
          cacheClear();
          resetDashboardGate();
          resetScreenGates();
          resetTelemetryThrottle();
          resetDismissedEvents();
        }
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

  // Flags are part of "ready" so a feature that is switched off is never
  // painted for a frame. They load concurrently with auth, and
  // FeatureFlagProvider's 2.5 s timeout guarantees this cannot hang.
  const flagsReady = useFeatureFlagsReady();

  const appReady = authResolved && flagsReady && (!hasSession || !profileLoading);

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

  const [activeTab, setActiveTab] = useState<NavTab>('home');

  // Set by a tab's own sub-view (e.g. the Workout tab's Exercise
  // Library) so the shared AppTopBar can show a back button and that
  // view's title instead of the tab's own brand/section label. Reset on
  // every tab switch — a stale back button pointing at a screen that is
  // no longer mounted would do nothing useful.
  const [subScreen, setSubScreen] = useState<{ title: string; onBack: () => void } | null>(null);
  const setActiveTabAndClearSubScreen = (tab: NavTab) => {
    setSubScreen(null);
    setActiveTab(tab);
  };

  // The one place installing the actual hardware-back listener — see
  // useHardwareBack.ts for why the app needs this at all (no router, so
  // nothing was undoing a sub-screen before Android just closed the app).
  useRootHardwareBackHandler();

  // Runs only while the tab bar itself is on screen — the auth, boot and
  // onboarding screens below have no tabs to unwind, so Android's normal
  // "back exits" applies there untouched. On the tab bar: a sub-screen
  // closes first; with none open, back returns to Home instead of
  // exiting, the usual Android pattern; only Home itself lets the press
  // through to actually exit.
  const handleHardwareBack = useCallback(() => {
    if (subScreen) {
      subScreen.onBack();
      return true;
    }
    if (activeTab !== 'home') {
      setActiveTabAndClearSubScreen('home');
      return true;
    }
    return false;
  }, [subScreen, activeTab]);

  useHardwareBack(
    handleHardwareBack,
    bootComplete && hasSession && !profileLoading && !needsOnboarding,
  );

  // Session-scoped: once dismissed the advert stays gone until the app is
  // restarted, which is as persistent as an advert should be without a
  // stored preference behind it.
  const [adDismissed, setAdDismissed] = useState(false);

  // A plan the next tab should scroll to — set when a dashboard card
  // sends the user to its session. Cleared once the tab has landed, so
  // returning to that tab later from the nav bar opens at the top as usual.
  const [focusPlanId, setFocusPlanId] = useState<string | null>(null);
  const openPlanInTab = (tab: 'workout' | 'nutrition', planId: string) => {
    setFocusPlanId(planId);
    setActiveTabAndClearSubScreen(tab);
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
            {/* The skeleton stands in until every dashboard section has
                loaded, then the real screen replaces it in one go. The
                gate's wrapper takes over the spacing scrollContent used to
                apply between these two directly. */}
            <DashboardLoadGate skeleton={<DashboardSkeleton />} style={styles.dashboardStack}>
              <DashboardOverview />
              <TodaysScheduleSlider
                onOpenWorkout={(planId) => openPlanInTab('workout', planId)}
                onOpenMeal={(planId) => openPlanInTab('nutrition', planId)}
                onViewWorkouts={() => setActiveTabAndClearSubScreen('workout')}
                onViewMeals={() => setActiveTabAndClearSubScreen('nutrition')}
              />
            </DashboardLoadGate>
          </ScrollView>
        );

      case 'workout':
        // return <WorkoutPlanner />;
        return (
          <View style={styles.tabContent}>
            <WorkoutSession
              focusPlanId={focusPlanId}
              onFocusHandled={clearFocus}
              onSubScreenChange={setSubScreen}
            />
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

      <AppTopBar
        activeTab={activeTab}
        onProfilePress={() => setActiveTabAndClearSubScreen('profile')}
        subScreen={subScreen}
      />
      <View style={styles.content}>{renderScreen()}</View>

      {/* Subscription advert, above the nav bar on the dashboard only.
          Mounted outside `content` and absolutely positioned so it floats
          over the scroll rather than pushing it — the dashboard does not
          jump when the advert arrives five seconds in.

          `adDismissed` lives here rather than in the banner so it
          survives a tab switch: dismissing it on the way to the Workout
          tab has to mean dismissed, not "back in five seconds". */}
      {activeTab === 'home' && !adDismissed ? (
        // box-none so only the card itself catches touches — the empty
        // space either side of it still scrolls the dashboard underneath.
        <View style={styles.adSlot} pointerEvents="box-none">
          <FeatureGate flag="enabledAddForSubscription">
            <SubscriptionAdBanner onDismiss={() => setAdDismissed(true)} />
          </FeatureGate>
        </View>
      ) : null}

      <BottomNavBar activeTab={activeTab} onTabPress={setActiveTabAndClearSubScreen} />
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
      <FeatureFlagProvider>
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
            {/* Owns everything notification-related, behind the
                `notifications` flag. Sits beside AppContent so it is
                unaffected by the splash and auth early returns. */}
            <NotificationsRoot />
          </DialogProvider>
        </SafeAreaProvider>
      </ThemeProvider>
      </FeatureFlagProvider>
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

  // Floats the advert over the dashboard, clear of the nav bar below it
  // (BottomNavBar is 64 high on an 8 bottom padding). Absolute so the
  // dashboard does not shift when the advert slides in five seconds in.
  adSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 100,
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

  // The gap scrollContent applies between the dashboard's sections —
  // repeated here because the gate wraps them in a View of their own.
  dashboardStack: {
    gap: 24,
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