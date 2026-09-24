// Step 2 — how often the user trains today. Asked up front (not folded
// into the later activity/health step) because it is the single biggest
// lever on TDEE, and asking it early lets every later screen's copy
// ("this helps us calculate...") actually be true.
import React from 'react';
import { ScrollView, View } from 'react-native';
import { Activity, Dumbbell, HeartPulse } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import { ActivityLevel } from '../../Services/userProfileService';
import { PrimaryButton, SelectCard, StepHeader, StepTitle } from './OnboardingUI';
import { themedStyles } from '../../Theme/ThemeContext';

const ICON_SIZE = 21;

const FREQUENCIES: {
  value: ActivityLevel;
  title: string;
  description: string;
  icon: (color: string) => React.ReactNode;
}[] = [
  {
    value: 'sedentary',
    title: '0-2 times',
    description: 'Minimal activity',
    icon: color => <Activity size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'moderate',
    title: '3-5 times',
    description: 'Moderate activity',
    icon: color => <Dumbbell size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'very_active',
    title: '6+ times',
    description: 'Very active',
    icon: color => <HeartPulse size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
];

export interface WorkoutFrequencyStepProps {
  value: ActivityLevel;
  onChange: (activityLevel: ActivityLevel) => void;
  onContinue: () => void;
  onBack: () => void;
}

export const WorkoutFrequencyStep: React.FC<WorkoutFrequencyStepProps> = ({
  value,
  onChange,
  onContinue,
  onBack,
}) => (
  <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <StepHeader step={3} onBack={onBack} />

    <StepTitle
      title="How often do you work out?"
      subtitle="This helps us calculate your daily calorie needs"
    />

    <View style={styles.options} accessibilityRole="radiogroup">
      {FREQUENCIES.map(frequency => {
        const selected = frequency.value === value;
        return (
          <SelectCard
            key={frequency.value}
            title={frequency.title}
            description={frequency.description}
            selected={selected}
            onPress={() => onChange(frequency.value)}
            icon={frequency.icon(selected ? colors.white : colors.textSecondary)}
          />
        );
      })}
    </View>

    <PrimaryButton label="Continue" onPress={onContinue} />
  </ScrollView>
);

export default WorkoutFrequencyStep;

const styles = themedStyles(() => ({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  },
  options: { gap: spacing.sm },
}));
