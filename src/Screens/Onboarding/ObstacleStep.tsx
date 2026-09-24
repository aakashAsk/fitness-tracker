// Step 3 — what gets in the user's way. Purely informational today (no
// formula reads it), but it lets the dashboard's nudges and reminders
// eventually target the specific obstacle instead of a generic tip.
import React from 'react';
import { ScrollView, View } from 'react-native';
import { Clock, Lightbulb, Link2, UtensilsCrossed, Users } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import { Obstacle } from '../../Services/userProfileService';
import { PrimaryButton, SelectCard, StepHeader, StepTitle } from './OnboardingUI';
import { themedStyles } from '../../Theme/ThemeContext';

const ICON_SIZE = 21;

const OBSTACLES: {
  value: Obstacle;
  title: string;
  description: string;
  icon: (color: string) => React.ReactNode;
}[] = [
  {
    value: 'consistency',
    title: 'Lack of Consistency',
    description: 'Struggling to maintain healthy habits daily',
    icon: color => <Link2 size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'eating-habits',
    title: 'Unhealthy Eating Habits',
    description: 'Finding it tough to eat nutritious meals',
    icon: color => <UtensilsCrossed size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'support',
    title: 'Lack of Support',
    description: 'Missing encouragement from friends and family',
    icon: color => <Users size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'busy-schedule',
    title: 'Busy Schedule',
    description: 'No time for planning and preparing meals',
    icon: color => <Clock size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'meal-inspiration',
    title: 'Lack of Meal Inspiration',
    description: 'Running out of ideas for healthy meals',
    icon: color => <Lightbulb size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
];

export interface ObstacleStepProps {
  value: Obstacle;
  onChange: (obstacle: Obstacle) => void;
  onContinue: () => void;
  onBack: () => void;
}

export const ObstacleStep: React.FC<ObstacleStepProps> = ({
  value,
  onChange,
  onContinue,
  onBack,
}) => (
  <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <StepHeader step={5} onBack={onBack} />

    <StepTitle
      title="What's your biggest obstacle?"
      subtitle="Choose the main challenge we can help you overcome"
    />

    <View style={styles.options} accessibilityRole="radiogroup">
      {OBSTACLES.map(obstacle => {
        const selected = obstacle.value === value;
        return (
          <SelectCard
            key={obstacle.value}
            title={obstacle.title}
            description={obstacle.description}
            selected={selected}
            onPress={() => onChange(obstacle.value)}
            icon={obstacle.icon(selected ? colors.white : colors.textSecondary)}
          />
        );
      })}
    </View>

    <PrimaryButton label="Continue" onPress={onContinue} />
  </ScrollView>
);

export default ObstacleStep;

const styles = themedStyles(() => ({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  },
  options: { gap: spacing.sm },
}));
