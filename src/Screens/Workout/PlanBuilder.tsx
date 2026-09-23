import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';
import { textStyle } from '../../Theme/typography';
import { ExerciseItem, TrainingDays } from './Types';
import { DAY_ORDER } from './Data';
import { StepIndicator } from './StepIndicator';
import { RoutineProfileSummary } from './RoutineProfileSummary';
import { ExerciseList } from './ExerciseList';
import { DaySelector } from './DaySelector';
import { ScheduleTimeSelector } from './ScheduleTimeSelector';
import { SessionReminder } from './SessionReminder';
import { AIOptimizationBanner } from './AIOptimizationBanner';
import { themedStyles } from '../../Theme/ThemeContext';
import { useFeatureFlag } from '../../FeatureFlags';

interface PlanBuilderProps {
  onEditRoutineProfile: () => void;

  exercises: ExerciseItem[];
  onMoveExercise: (index: number, direction: 'up' | 'down') => void;
  onEditExercise: (exercise: ExerciseItem) => void;
  searchFilter: string;
  onSearchFilterChange: (value: string) => void;
  selectedCategory: string;
  onSelectedCategoryChange: (category: string) => void;

  trainingDays: TrainingDays;
  onToggleDay: (day: (typeof DAY_ORDER)[number]) => void;
  cadenceSummary: string;

  targetHour: string;
  targetMinute: string;
  targetPeriod: 'AM' | 'PM';
  onTargetPeriodChange: (period: 'AM' | 'PM') => void;
  sessionDuration: string;
  onSessionDurationChange: (duration: string) => void;

  sessionReminder: boolean;
  onToggleSessionReminder: () => void;
  reminderOffset: string;
  onReminderOffsetChange: (offset: string) => void;
}

export const PlanBuilder: React.FC<PlanBuilderProps> = (props) => {
  const pushDisabled = useFeatureFlag('disabledPushNotification');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[textStyle('labelCaps'), { color: colors.primary }]}>PLAN ARCHITECT</Text>
          <Text style={styles.title}>Create Custom Plan</Text>
        </View>
        <Text style={styles.stepPill}>Step 3 of 4</Text>
      </View>

      <StepIndicator />

      <RoutineProfileSummary onEdit={props.onEditRoutineProfile} />

      <ExerciseList
        exercises={props.exercises}
        onMoveExercise={props.onMoveExercise}
        onEditExercise={props.onEditExercise}
        searchFilter={props.searchFilter}
        onSearchFilterChange={props.onSearchFilterChange}
        selectedCategory={props.selectedCategory}
        onSelectedCategoryChange={props.onSelectedCategoryChange}
      />

      <DaySelector
        trainingDays={props.trainingDays}
        onToggleDay={props.onToggleDay}
        cadenceSummary={props.cadenceSummary}
      />

      <ScheduleTimeSelector
        targetHour={props.targetHour}
        targetMinute={props.targetMinute}
        targetPeriod={props.targetPeriod}
        onTargetPeriodChange={props.onTargetPeriodChange}
        sessionDuration={props.sessionDuration}
        onSessionDurationChange={props.onSessionDurationChange}
      />

      {pushDisabled ? null : (
        <SessionReminder
          enabled={props.sessionReminder}
          onToggle={props.onToggleSessionReminder}
          offset={props.reminderOffset}
          onOffsetChange={props.onReminderOffsetChange}
        />
      )}

      <AIOptimizationBanner
        sessionDuration={props.sessionDuration}
        targetHour={props.targetHour}
        targetMinute={props.targetMinute}
        targetPeriod={props.targetPeriod}
      />
    </View>
  );
};

const styles = themedStyles(() => ({
  container: {
    gap: 20,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: { flexShrink: 1 },
  title: { fontSize: 18, fontWeight: '700', color: colors.white },
  stepPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
}));

export default PlanBuilder;
