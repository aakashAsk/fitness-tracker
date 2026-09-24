// Step 2 — gender, age, height and weight: the four inputs Mifflin-St
// Jeor needs. The BMR preview at the bottom recomputes live from the
// same helper the saved profile uses, so what the user sees here is
// exactly what gets written.
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Cake, CalendarDays, Ruler, Target, Weight, Zap } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import { calculateBmr, estimateHealthyWeightKg, Gender } from '../../Services/userProfileService';
import {
  FieldCard,
  PrimaryButton,
  SegmentedControl,
  StepHeader,
  StepTitle,
  Stepper,
  WheelColumn,
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT_NAMES = MONTH_NAMES.map((name) => name.slice(0, 3));

interface BirthDate {
  day: number;
  month: number;
  year: number;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

/** Full date comparison, not just a year subtraction — a birthday not
 * yet reached this year must still count as last year's age. */
function ageFromBirthDate({ day, month, year }: BirthDate): number {
  const today = new Date();
  const birth = new Date(year, month - 1, day);
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

/** { day: 15, month: 3, year: 1998 } -> "1998-03-15" — the stored format,
 * matching every other date key in this app (see dateRange.ts). */
function birthDateToIso({ day, month, year }: BirthDate): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "1998-03-15" -> { day: 15, month: 3, year: 1998 }, or null if the
 * stored string is missing or malformed. */
function isoToBirthDate(iso: string | null): BirthDate | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export interface BodyMetricsValue {
  gender: Gender;
  age: number;
  /** "YYYY-MM-DD", or null if the profile predates this field. */
  birthDate: string | null;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
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

  // Age is derived from this and kept in sync below (and both are saved
  // to the profile — see userProfileService's birthDate field). Wheels
  // only ever offer real calendar days, so unlike a typed field this can
  // never be "invalid" — nothing to validate before syncing it out.
  // Seeded from the incoming birthDate when editing a saved profile;
  // otherwise from the incoming age (Jan 1 of the matching birth year),
  // and only once, on mount.
  const [birthDate, setBirthDate] = React.useState<BirthDate>(
    () =>
      isoToBirthDate(value.birthDate) ?? {
        day: 1,
        month: 1,
        year: new Date().getFullYear() - value.age,
      },
  );

  const dayItems = React.useMemo(
    () => Array.from({ length: daysInMonth(birthDate.month, birthDate.year) }, (_, i) => String(i + 1)),
    [birthDate.month, birthDate.year],
  );
  // Newest year first (top), oldest last — matches how a birth-year wheel
  // is normally laid out, and the AGE_RANGE bounds mean the wheel already
  // rules out an implausible age rather than needing to validate one.
  const newestBirthYear = new Date().getFullYear() - AGE_RANGE.min;
  const yearItems = React.useMemo(
    () =>
      Array.from({ length: AGE_RANGE.max - AGE_RANGE.min + 1 }, (_, i) =>
        String(newestBirthYear - i),
      ),
    [newestBirthYear],
  );

  const onChangeBirthMonth = (index: number) => {
    const month = index + 1;
    setBirthDate((current) => ({
      ...current,
      month,
      // A day that only exists in the old month (e.g. the 31st) must not
      // silently roll over into the next one.
      day: Math.min(current.day, daysInMonth(month, current.year)),
    }));
  };
  const onChangeBirthDay = (index: number) => setBirthDate((current) => ({ ...current, day: index + 1 }));
  const onChangeBirthYear = (index: number) => {
    const year = newestBirthYear - index;
    setBirthDate((current) => ({
      ...current,
      year,
      day: Math.min(current.day, daysInMonth(current.month, year)),
    }));
  };

  React.useEffect(() => {
    const age = clamp(ageFromBirthDate(birthDate), AGE_RANGE.min, AGE_RANGE.max);
    const iso = birthDateToIso(birthDate);
    if (age !== value.age || iso !== value.birthDate) patch({ age, birthDate: iso });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [birthDate.day, birthDate.month, birthDate.year]);

  // Suggests a target weight from height alone the moment height is
  // known, and keeps it in step as height changes — but only until the
  // user touches the target-weight stepper themselves. Adjusting the
  // suggestion by hand is a real answer; overwriting it after that would
  // undo an edit the user just made.
  const targetTouched = React.useRef(false);
  const suggestedTargetWeightKg = estimateHealthyWeightKg(value.heightCm);
  React.useEffect(() => {
    if (targetTouched.current) return;
    if (value.targetWeightKg === suggestedTargetWeightKg) return;
    patch({ targetWeightKg: suggestedTargetWeightKg });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedTargetWeightKg]);

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

  const adjustTargetWeight = (direction: 1 | -1) => {
    // A manual nudge means the user has a real answer in mind — the
    // suggestion effect above must stop overwriting it from here on.
    targetTouched.current = true;
    const stepKg = weightUnit === 'kg' ? 0.5 : 1 / LBS_PER_KG;
    patch({
      targetWeightKg: clamp(
        Math.round((value.targetWeightKg + direction * stepKg) * 10) / 10,
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

      <FieldCard
        label="Date of birth"
        icon={<CalendarDays size={16} color={colors.secondary} strokeWidth={2.4} />}
        trailing={<Text style={styles.fieldNote}>Used for BMR</Text>}
      >
        <View style={styles.birthHeaderPill}>
          <Text style={styles.birthHeaderText}>
            {MONTH_NAMES[birthDate.month - 1]} {birthDate.day}, {birthDate.year}
          </Text>
        </View>

        <View style={styles.wheelRow}>
          <WheelColumn
            items={MONTH_SHORT_NAMES}
            selectedIndex={birthDate.month - 1}
            onChange={onChangeBirthMonth}
          />
          <WheelColumn
            items={dayItems}
            selectedIndex={birthDate.day - 1}
            onChange={onChangeBirthDay}
          />
          <WheelColumn
            items={yearItems}
            selectedIndex={newestBirthYear - birthDate.year}
            onChange={onChangeBirthYear}
          />
        </View>
      </FieldCard>

      {/* Derived from the birth date above, not its own input — the
          stepper is disabled rather than removed so the same "here's the
          number" layout every other field uses still applies to it. */}
      <FieldCard
        label="Age"
        icon={<Cake size={16} color={colors.secondary} strokeWidth={2.4} />}
        trailing={<Text style={styles.fieldNote}>From your birth date</Text>}
      >
        <Stepper
          value={String(value.age)}
          unit="years"
          accessibilityLabel="age"
          onDecrement={() => undefined}
          onIncrement={() => undefined}
          decrementDisabled
          incrementDisabled
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

      <FieldCard
        label="Target weight"
        icon={<Target size={16} color={colors.success} strokeWidth={2.4} />}
        trailing={<Text style={styles.fieldNote}>{weightUnit}</Text>}
      >
        <Stepper
          value={
            weightUnit === 'kg'
              ? value.targetWeightKg.toFixed(1)
              : (value.targetWeightKg * LBS_PER_KG).toFixed(1)
          }
          unit={weightUnit}
          accessibilityLabel="target weight"
          onDecrement={() => adjustTargetWeight(-1)}
          onIncrement={() => adjustTargetWeight(1)}
          decrementDisabled={value.targetWeightKg <= WEIGHT_RANGE.min}
          incrementDisabled={value.targetWeightKg >= WEIGHT_RANGE.max}
        />
        <Text style={styles.targetNote}>
          {targetTouched.current ? 'Set by you' : 'Suggested from your height'} — this is an
          approximate healthy range, not an exact or medical target. Adjust it to whatever is
          right for you.
        </Text>
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
  birthHeaderPill: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    marginBottom: spacing.xs,
  },
  birthHeaderText: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  wheelRow: { flexDirection: 'row' },
  targetNote: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
  },
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
