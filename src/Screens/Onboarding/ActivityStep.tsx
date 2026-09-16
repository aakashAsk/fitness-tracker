// Step 3 — activity level, weekly pace, injuries and diet, plus a live
// preview of the numbers that are about to be saved.
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Activity,
  Armchair,
  Bolt,
  Dumbbell,
  Flame,
  HeartPulse,
  Salad,
  Utensils,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import {
  ActivityLevel,
  deriveTargets,
  FitnessGoal,
  ProfileAnswers,
  WeeklyPace,
} from '../../Services/userProfileService';
import {
  Chip,
  FieldCard,
  PrimaryButton,
  SegmentedControl,
  SelectCard,
  StepHeader,
  StepTitle,
} from './OnboardingUI';

const ICON_SIZE = 20;

const ACTIVITY_LEVELS: {
  value: ActivityLevel;
  title: string;
  description: string;
  badge?: string;
  icon: (color: string) => React.ReactNode;
}[] = [
  {
    value: 'sedentary',
    title: 'Sedentary',
    description: 'Desk job, little deliberate movement',
    icon: color => <Armchair size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'light',
    title: 'Lightly Active',
    description: '1–3 training days per week',
    icon: color => <Activity size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'moderate',
    title: 'Moderately Active',
    description: '3–5 training days per week',
    badge: 'Most common',
    icon: color => <Dumbbell size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
  {
    value: 'very_active',
    title: 'Very Active',
    description: '6–7 days of intense training',
    icon: color => <HeartPulse size={ICON_SIZE} color={color} strokeWidth={2.4} />,
  },
];

const PACE_OPTIONS: { value: WeeklyPace; label: string; sublabel: string }[] = [
  { value: 0.25, label: 'Gentle', sublabel: '0.25 kg / wk' },
  { value: 0.5, label: 'Steady', sublabel: '0.5 kg / wk' },
  { value: 0.75, label: 'Aggressive', sublabel: '0.75 kg / wk' },
];

const INJURY_OPTIONS = [
  'Lower Back',
  'Knees',
  'Shoulders',
  'Wrists / Elbows',
  'Neck',
  'Hips / Ankles',
];

const DIET_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Keto / Low Carb',
  'Gluten-Free',
  'Dairy-Free',
  'Halal / Kosher',
  'Nut Allergy',
];

/** Adds the value if absent, removes it if present. */
function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value];
}

export interface ActivityStepValue {
  activityLevel: ActivityLevel;
  weeklyPaceKg: WeeklyPace;
  injuries: string[];
  dietaryPreferences: string[];
}

export interface ActivityStepProps {
  value: ActivityStepValue;
  /** Needed to derive the preview numbers and to decide whether the
      weekly-pace control is relevant at all. */
  answers: ProfileAnswers;
  goal: FitnessGoal;
  onChange: (next: ActivityStepValue) => void;
  onSubmit: () => void;
  onBack: () => void;
  saving?: boolean;
  errorMessage?: string | null;
}

export const ActivityStep: React.FC<ActivityStepProps> = ({
  value,
  answers,
  goal,
  onChange,
  onSubmit,
  onBack,
  saving = false,
  errorMessage = null,
}) => {
  const patch = (next: Partial<ActivityStepValue>) => onChange({ ...value, ...next });

  // Pace only moves the number for fat loss — for the other three goals
  // calculateCalorieTarget ignores it entirely, so showing the control
  // would promise an effect it does not have.
  const showPace = goal === 'fat-loss';

  const { tdee, dailyCalorieTarget, macros } = deriveTargets({ ...answers, ...value });
  const calorieDelta = dailyCalorieTarget - tdee;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <StepHeader step={3} onBack={onBack} />

      <StepTitle
        title="Activity, health & targets"
        subtitle="Fine-tune your training volume, joint care, and nutrition preferences."
      />

      <View style={styles.options} accessibilityRole="radiogroup">
        {ACTIVITY_LEVELS.map(level => {
          const selected = level.value === value.activityLevel;
          return (
            <SelectCard
              key={level.value}
              title={level.title}
              description={level.description}
              badge={level.badge}
              selected={selected}
              onPress={() => patch({ activityLevel: level.value })}
              icon={level.icon(selected ? colors.white : colors.textSecondary)}
            />
          );
        })}
      </View>

      {showPace ? (
        <FieldCard
          label="Target weekly pace"
          icon={<Flame size={16} color={colors.secondary} strokeWidth={2.4} />}
        >
          <Text style={styles.cardCopy}>
            How fast you want to lose weight. Faster means a deeper deficit and a harder
            week — steady is what most people sustain.
          </Text>
          <SegmentedControl<WeeklyPace>
            value={value.weeklyPaceKg}
            onChange={weeklyPaceKg => patch({ weeklyPaceKg })}
            options={PACE_OPTIONS}
          />
        </FieldCard>
      ) : null}

      <FieldCard
        label="Injuries & joint limitations"
        icon={<HeartPulse size={16} color={colors.primary} strokeWidth={2.4} />}
        trailing={<Text style={styles.fieldNote}>Optional</Text>}
      >
        <Text style={styles.cardCopy}>
          Selected areas are flagged so high-strain movements can be swapped out.
        </Text>
        <View style={styles.chipWrap}>
          {INJURY_OPTIONS.map(option => (
            <Chip
              key={option}
              label={option}
              selected={value.injuries.includes(option)}
              onPress={() => patch({ injuries: toggle(value.injuries, option) })}
            />
          ))}
          {/* Clearing is the one thing a toggle cannot express — "none"
              is the absence of selections, not another selection. */}
          <Chip
            label="None / injury free"
            accent={colors.success}
            selected={value.injuries.length === 0}
            onPress={() => patch({ injuries: [] })}
          />
        </View>
      </FieldCard>

      <FieldCard
        label="Dietary protocol & restrictions"
        icon={<Salad size={16} color={colors.secondary} strokeWidth={2.4} />}
        trailing={
          <Text style={styles.fieldNote}>
            {value.dietaryPreferences.length
              ? `${value.dietaryPreferences.length} active`
              : 'Optional'}
          </Text>
        }
      >
        <Text style={styles.cardCopy}>
          Personalizes macro distribution and recipe recommendations.
        </Text>
        <View style={styles.chipWrap}>
          {DIET_OPTIONS.map(option => (
            <Chip
              key={option}
              label={option}
              accent={colors.secondary}
              selected={value.dietaryPreferences.includes(option)}
              onPress={() =>
                patch({ dietaryPreferences: toggle(value.dietaryPreferences, option) })
              }
            />
          ))}
          <Chip
            label="None / standard"
            accent={colors.success}
            selected={value.dietaryPreferences.length === 0}
            onPress={() => patch({ dietaryPreferences: [] })}
          />
        </View>
      </FieldCard>

      {/* Everything above, resolved into the numbers that get written. */}
      <View style={styles.summary}>
        <View style={styles.summaryHeader}>
          <Bolt size={17} color={colors.primary} strokeWidth={2.6} />
          <Text style={styles.summaryTitle}>Your starting targets</Text>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metric}>
            <View style={styles.metricLabelRow}>
              <Flame size={13} color={colors.secondary} strokeWidth={2.6} />
              <Text style={styles.metricLabel}>Daily burn (TDEE)</Text>
            </View>
            <Text style={styles.metricValue}>
              {tdee.toLocaleString()} <Text style={styles.metricUnit}>kcal</Text>
            </Text>
            <Text style={styles.metricCaption}>Dynamic expenditure</Text>
          </View>

          <View style={styles.metric}>
            <View style={styles.metricLabelRow}>
              <Utensils size={13} color={colors.primary} strokeWidth={2.6} />
              <Text style={styles.metricLabel}>Daily intake</Text>
            </View>
            <Text style={[styles.metricValue, { color: colors.primary }]}>
              {dailyCalorieTarget.toLocaleString()} <Text style={styles.metricUnit}>kcal</Text>
            </Text>
            <Text style={[styles.metricCaption, styles.metricDelta]}>
              {calorieDelta === 0
                ? 'At maintenance'
                : `${calorieDelta > 0 ? '+' : ''}${calorieDelta} kcal`}
            </Text>
          </View>
        </View>

        <View style={styles.macroRow}>
          <MacroPill label="Protein" grams={macros.proteinG} color={colors.protein} />
          <MacroPill label="Carbs" grams={macros.carbsG} color={colors.carbs} />
          <MacroPill label="Fats" grams={macros.fatsG} color={colors.fats} />
        </View>
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <PrimaryButton
        label="Complete setup"
        accent={colors.secondary}
        loading={saving}
        onPress={onSubmit}
      />
    </ScrollView>
  );
};

const MacroPill: React.FC<{ label: string; grams: number; color: string }> = ({
  label,
  grams,
  color,
}) => (
  <View style={[styles.macroPill, { backgroundColor: withOpacity(color, 0.12) }]}>
    <Text style={[styles.macroValue, { color }]}>{grams}g</Text>
    <Text style={styles.macroLabel}>{label}</Text>
  </View>
);

export default ActivityStep;

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  options: { gap: spacing.sm },
  cardCopy: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  fieldNote: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },

  summary: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing['2xs'] },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  metricRow: { flexDirection: 'row', gap: spacing.sm },
  metric: {
    flex: 1,
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricLabel: { fontSize: 10.5, fontWeight: '600', color: colors.textSecondary },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  metricUnit: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  metricCaption: { fontSize: 10.5, color: colors.textMuted },
  metricDelta: { color: colors.secondary, fontWeight: '700' },

  macroRow: { flexDirection: 'row', gap: spacing.xs },
  macroPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  macroValue: { fontSize: 15, fontWeight: '800' },
  macroLabel: { fontSize: 10.5, fontWeight: '600', color: colors.textSecondary },

  errorBanner: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: withOpacity(colors.error, 0.12),
  },
  errorText: { fontSize: 12.5, fontWeight: '600', color: colors.error },
});
