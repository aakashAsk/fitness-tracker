// Step 2 — gender, age, height and weight: the four inputs Mifflin-St
// Jeor needs. The BMR preview at the bottom recomputes live from the
// same helper the saved profile uses, so what the user sees here is
// exactly what gets written.
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Cake, Ruler, Weight, Zap } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import { calculateBmr, Gender } from '../../Services/userProfileService';
import {
  FieldCard,
  PrimaryButton,
  SegmentedControl,
  StepHeader,
  StepTitle,
  Stepper,
} from './OnboardingUI';
import { themedStyles } from '../../Theme/ThemeContext';

// Ranges wide enough to cover any real user while keeping the steppers
// from producing a BMR that is arithmetically valid but meaningless.
const AGE_RANGE = { min: 13, max: 100 };
const HEIGHT_RANGE = { min: 120, max: 230 };
const WEIGHT_RANGE = { min: 30, max: 250 };

const CM_PER_INCH = 2.54;
const LBS_PER_KG = 2.20462;

export type HeightUnit = 'cm' | 'ft';
export type WeightUnit = 'kg' | 'lbs';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** 178 -> "5'10"". */
function formatFeetInches(heightCm: number): string {
  const totalInches = Math.round(heightCm / CM_PER_INCH);
  return `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;
}

export interface BodyMetricsValue {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
}

export interface BodyMetricsStepProps {
  value: BodyMetricsValue;
  onChange: (next: BodyMetricsValue) => void;
  onContinue: () => void;
  onBack: () => void;
}

export const BodyMetricsStep: React.FC<BodyMetricsStepProps> = ({
  value,
  onChange,
  onContinue,
  onBack,
}) => {
  const [heightUnit, setHeightUnit] = React.useState<HeightUnit>('cm');
  const [weightUnit, setWeightUnit] = React.useState<WeightUnit>('kg');

  const patch = (next: Partial<BodyMetricsValue>) => onChange({ ...value, ...next });

  // Height and weight are always stored in metric; the imperial units
  // are a display concern, and the step size changes with them so the
  // buttons move by a sensible amount in whichever unit is showing.
  const adjustHeight = (direction: 1 | -1) => {
    const stepCm = heightUnit === 'cm' ? 1 : CM_PER_INCH;
    patch({
      heightCm: clamp(
        Math.round(value.heightCm + direction * stepCm),
        HEIGHT_RANGE.min,
        HEIGHT_RANGE.max,
      ),
    });
  };

  const adjustWeight = (direction: 1 | -1) => {
    const stepKg = weightUnit === 'kg' ? 0.5 : 1 / LBS_PER_KG;
    patch({
      weightKg: clamp(
        Math.round((value.weightKg + direction * stepKg) * 10) / 10,
        WEIGHT_RANGE.min,
        WEIGHT_RANGE.max,
      ),
    });
  };

  const bmr = calculateBmr(value);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <StepHeader step={2} onBack={onBack} />

      <StepTitle
        title="Tell us about yourself"
        subtitle="We calculate your basal metabolic rate (BMR) and daily targets from these four numbers."
      />

      <FieldCard
        label="Biological sex"
        icon={<Zap size={16} color={colors.primary} strokeWidth={2.4} />}
        trailing={<Text style={styles.fieldNote}>Used for BMR</Text>}
      >
        <SegmentedControl<Gender>
          value={value.gender}
          onChange={gender => patch({ gender })}
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'other', label: 'Other' },
          ]}
        />
      </FieldCard>

      <FieldCard label="Age" icon={<Cake size={16} color={colors.secondary} strokeWidth={2.4} />}>
        <Stepper
          value={String(value.age)}
          unit="years"
          accessibilityLabel="age"
          onDecrement={() => patch({ age: clamp(value.age - 1, AGE_RANGE.min, AGE_RANGE.max) })}
          onIncrement={() => patch({ age: clamp(value.age + 1, AGE_RANGE.min, AGE_RANGE.max) })}
          decrementDisabled={value.age <= AGE_RANGE.min}
          incrementDisabled={value.age >= AGE_RANGE.max}
        />
      </FieldCard>

      <FieldCard
        label="Height"
        icon={<Ruler size={16} color={colors.primary} strokeWidth={2.4} />}
        trailing={
          <SegmentedControl<HeightUnit>
            compact
            style={styles.unitToggle}
            value={heightUnit}
            onChange={setHeightUnit}
            options={[
              { value: 'cm', label: 'cm' },
              { value: 'ft', label: 'ft / in' },
            ]}
          />
        }
      >
        <Stepper
          value={
            heightUnit === 'cm'
              ? String(Math.round(value.heightCm))
              : formatFeetInches(value.heightCm)
          }
          unit={heightUnit === 'cm' ? 'cm' : ''}
          caption={
            heightUnit === 'cm'
              ? formatFeetInches(value.heightCm)
              : `${Math.round(value.heightCm)} cm`
          }
          accessibilityLabel="height"
          onDecrement={() => adjustHeight(-1)}
          onIncrement={() => adjustHeight(1)}
          decrementDisabled={value.heightCm <= HEIGHT_RANGE.min}
          incrementDisabled={value.heightCm >= HEIGHT_RANGE.max}
        />
      </FieldCard>

      <FieldCard
        label="Current weight"
        icon={<Weight size={16} color={colors.secondary} strokeWidth={2.4} />}
        trailing={
          <SegmentedControl<WeightUnit>
            compact
            style={styles.unitToggle}
            value={weightUnit}
            onChange={setWeightUnit}
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lbs', label: 'lbs' },
            ]}
          />
        }
      >
        <Stepper
          value={
            weightUnit === 'kg'
              ? value.weightKg.toFixed(1)
              : (value.weightKg * LBS_PER_KG).toFixed(1)
          }
          unit={weightUnit}
          accessibilityLabel="weight"
          onDecrement={() => adjustWeight(-1)}
          onIncrement={() => adjustWeight(1)}
          decrementDisabled={value.weightKg <= WEIGHT_RANGE.min}
          incrementDisabled={value.weightKg >= WEIGHT_RANGE.max}
        />
      </FieldCard>

      <View style={styles.preview}>
        <View style={styles.previewIcon}>
          <Zap size={15} color={colors.white} strokeWidth={2.6} />
        </View>
        <Text style={styles.previewText}>
          Estimated baseline:{' '}
          <Text style={styles.previewValue}>{bmr.toLocaleString()} kcal/day</Text> before any
          exercise.
        </Text>
      </View>

      <PrimaryButton label="Continue" onPress={onContinue} />
    </ScrollView>
  );
};

export default BodyMetricsStep;

const styles = themedStyles(() => ({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  fieldNote: { fontSize: 11, color: colors.textMuted },
  unitToggle: { backgroundColor: colors.surfaceContainer },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: withOpacity(colors.secondary, 0.1),
  },
  previewIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  previewText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  previewValue: { fontWeight: '800', color: colors.textPrimary },
}));
