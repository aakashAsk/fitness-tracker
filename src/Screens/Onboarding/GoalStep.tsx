// Step 1 — the single question everything else is tuned against: what
// is the user training for. It drives the calorie target's direction
// (deficit / surplus / maintenance) and the macro split in
// userProfileService.
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Flame, Heart, Sprout, TrendingDown, TrendingUp } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import { FitnessGoal } from '../../Services/userProfileService';
import { PrimaryButton, SelectCard, StepHeader, StepTitle } from './OnboardingUI';
import { themedStyles } from '../../Theme/ThemeContext';

const ICON_SIZE = 21;

const GOALS: {
  value: FitnessGoal;
  title: string;
  description: string;
  hint: string;
  accent: string;
  badge?: string;
  icon: (color: string) => React.ReactNode;
}[] = [
  {
    value: 'weight-loss',
    title: 'Lose Weight',
    description: 'A straightforward caloric deficit, sized to your weekly pace.',
    hint: 'Deficit set by your weekly pace',
    accent: colors.secondary,
    icon: color => <TrendingDown size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'fat-loss',
    title: 'Lose Fat & Lean Out',
    description: 'Strategic caloric deficit with protein kept high to protect lean mass.',
    hint: 'Deficit set by your weekly pace',
    accent: colors.secondary,
    badge: 'Popular',
    icon: color => <Flame size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'weight-gain',
    title: 'Gain Weight',
    description: 'A straightforward caloric surplus to add weight steadily.',
    hint: '+10% caloric surplus',
    accent: colors.hypertrophy,
    icon: color => <TrendingUp size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'endurance',
    title: 'Boost Endurance & Stamina',
    description: 'Aerobic threshold work, heart-rate pacing zones, carb-forward fuelling.',
    hint: 'Eats at maintenance',
    accent: colors.cardio,
    icon: color => <Sprout size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'maintenance',
    title: 'Maintain & General Health',
    description: 'Balanced intake, longevity biomarkers, and consistent daily habits.',
    hint: 'Eats at maintenance',
    accent: colors.success,
    icon: color => <Heart size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
];

export interface GoalStepProps {
  value: FitnessGoal;
  onChange: (goal: FitnessGoal) => void;
  onContinue: () => void;
  onBack: () => void;
}

export const GoalStep: React.FC<GoalStepProps> = ({ value, onChange, onContinue, onBack }) => (
  <ScrollView
    contentContainerStyle={styles.content}
    showsVerticalScrollIndicator={false}
  >
    <StepHeader step={4} onBack={onBack} />

    <StepTitle
      title="What is your primary fitness goal?"
      subtitle="This sets your daily calories, macro split, and how your workouts are weighted."
    />

    <View style={styles.options} accessibilityRole="radiogroup">
      {GOALS.map(goal => {
        const selected = goal.value === value;
        return (
          <SelectCard
            key={goal.value}
            title={goal.title}
            description={goal.description}
            hint={goal.hint}
            badge={goal.badge}
            accent={goal.accent}
            selected={selected}
            onPress={() => onChange(goal.value)}
            icon={goal.icon(selected ? colors.white : colors.textSecondary)}
          />
        );
      })}
    </View>

    <View style={styles.note}>
      <Text style={styles.noteText}>
        Goals can be changed any time from your profile — your targets update instantly.
      </Text>
    </View>

    <PrimaryButton label="Continue" onPress={onContinue} />
  </ScrollView>
);

export default GoalStep;

const styles = themedStyles(() => ({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  },
  options: { gap: spacing.sm },
  note: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
  },
  noteText: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
}));
