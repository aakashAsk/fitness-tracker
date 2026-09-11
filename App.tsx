import React, { useState } from 'react';
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

import LiveTelemetry from './src/Screens/Dashboard/LiveTelementry';
import TodaysWorkoutCard from './src/Screens/Dashboard/TodaysWorkout';

import { colors } from './src/Theme/colors';
import BottomNavBar from './src/Components/Navigation';
import ScheduleScreen from './src/Screens/ScheduleScreen/Schedule';
import { WorkoutPlanner } from './src/Screens/Workout/WorkoutPlanner';

type NavTab = 'home' | 'workout' | 'nutrition' | 'progress';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <LiveTelemetry />
            <TodaysWorkoutCard />
          </ScrollView>
        );

      case 'workout':
        return (
          <WorkoutPlanner />
        );

      case 'nutrition':
        return (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Nutrition</Text>
          </View>
        );

      case 'progress':
        return (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Progress</Text>
          </View>
        );

      default:
        return null;
    }
  };

  const handleAddPress = () => {
    // Open your Quick Action / Add menu here
    console.log('Plus button pressed');
  };

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={colors.background}
        />

        <View style={styles.content}>
          {renderScreen()}
        </View>

        <BottomNavBar
          activeTab={activeTab}
          onTabPress={setActiveTab}
          onCenterPress={() => console.log('center pressed')}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.neutral,
  },

  content: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
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