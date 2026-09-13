import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
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
import { auth } from './src/Firebase/firebaseConfig';

function AppContent() {
  // One Firestore listener for the whole app — every screen reads the
  // result from the Redux store instead of subscribing individually.
  useWorkoutPlansSync();

  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  const hasSession = !!firebaseUser;

  useEffect(() => onAuthStateChanged(auth, setFirebaseUser), []);

  const [activeTab, setActiveTab] = useState<NavTab>('home');

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <DashboardOverview />
            <TodaysWorkoutCard />
            <UpcomingMealCard />
          </ScrollView>
        );

      case 'workout':
        // return <WorkoutPlanner />;
        return (
          <View style={styles.tabContent}>
            <WorkoutSession />
          </View>
        );

      case 'nutrition':
        return (
          <View style={styles.tabContent}>
            <NutritionScreen />
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
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Profile</Text>
          </View>
        );

      default:
        return null;
    }
  };

  if (!hasSession) {
    return (
      <SafeAreaProvider style={styles.safeArea}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar
            barStyle="dark-content"
            backgroundColor={colors.background}
          />
          <AuthNavigator />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={colors.background}
        />

        <View style={styles.content}>{renderScreen()}</View>

        <BottomNavBar activeTab={activeTab} onTabPress={setActiveTab} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    flex: 1,
  },

  tabContent: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 8,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 100,
    gap: 24,
  },

  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  placeholderText: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
});