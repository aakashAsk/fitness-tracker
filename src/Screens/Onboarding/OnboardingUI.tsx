// Shared building blocks for the three onboarding steps. They live in
// one file because none of them is useful outside this flow and each is
// a few dozen lines — splitting them would mean five imports per step
// screen for no reuse elsewhere.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ArrowRight, Check, Minus, Plus } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

export const TOTAL_STEPS = 3;

/** "Step 2 of 3" plus the fill bar above every step's content. */
export const StepHeader: React.FC<{ step: number; onBack?: () => void }> = ({
  step,
  onBack,
}) => {
  const percent = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <View style={styles.stepHeader}>
      <View style={styles.stepHeaderRow}>
        <Text style={styles.stepLabel}>
          Step {step} of {TOTAL_STEPS}
        </Text>
        {/* Step 1 has nowhere to go back to — the user would land on the
            sign-in screen of an account they just created. */}
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={HIT_SLOP} activeOpacity={0.7}>
            <Text style={styles.stepBack}>Back</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.stepPercent}>{percent}% complete</Text>
        )}
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
};

export const StepTitle: React.FC<{ title: string; subtitle: string }> = ({
  title,
  subtitle,
}) => (
  <View style={styles.titleBlock}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.subtitle}>{subtitle}</Text>
  </View>
);

export interface SelectCardProps {
  title: string;
  description: string;
  /** Small accented line under the description, e.g. "3–5 days / week". */
  hint?: string;
  badge?: string;
  icon: React.ReactNode;
  accent?: string;
  selected: boolean;
  onPress: () => void;
}

/** The full-width radio card used for goal and activity level. */
export const SelectCard: React.FC<SelectCardProps> = ({
  title,
  description,
  hint,
  badge,
  icon,
  accent = colors.primary,
  selected,
  onPress,
}) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ selected }}
    style={[
      styles.card,
      selected && { borderColor: accent, backgroundColor: withOpacity(accent, 0.06) },
    ]}
  >
    <View
      style={[
        styles.cardIcon,
        { backgroundColor: selected ? accent : colors.surfaceLow },
      ]}
    >
      {icon}
    </View>

    <View style={styles.cardBody}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {title}
        </Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: withOpacity(colors.secondary, 0.14) }]}>
            <Text style={[styles.badgeText, { color: colors.secondary }]}>{badge}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.cardDescription}>{description}</Text>

      {hint ? <Text style={[styles.cardHint, { color: accent }]}>{hint}</Text> : null}
    </View>

    <View
      style={[
        styles.indicator,
        selected ? { backgroundColor: accent, borderColor: accent } : null,
      ]}
    >
      {selected ? <Check size={14} color={colors.white} strokeWidth={3} /> : null}
    </View>
  </TouchableOpacity>
);

/** Multi-select pill, used for injuries and dietary preferences. */
export const Chip: React.FC<{
  label: string;
  selected: boolean;
  accent?: string;
  onPress: () => void;
}> = ({ label, selected, accent = colors.primary, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    style={[styles.chip, selected && { backgroundColor: accent, borderColor: accent }]}
  >
    {selected ? <Check size={13} color={colors.white} strokeWidth={3} /> : null}
    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
  </TouchableOpacity>
);

/** How long the pill takes to travel between segments. */
const SWITCH_TIMING = { duration: 220 } as const;

// Resolved here, at module scope, rather than inside the animated
// styles below. A useAnimatedStyle callback is a worklet running on the
// UI thread, and calling a plain JS helper like withOpacity from inside
// one throws "tried to synchronously call a remote function". Worklets
// may only close over values, never over functions that have not been
// workletized.
// Resolved per render inside Segment (below) rather than once here, so
// they also follow a theme switch.

interface SegmentLayout {
  x: number;
  width: number;
}

/**
 * Segmented single-select row — gender, unit toggles, weekly pace.
 *
 * The selected state is a single pill that slides between segments
 * rather than a background that pops on and off: the movement shows
 * *which* option you left and which you landed on, whereas an instant
 * swap makes a mis-tap on a two-option toggle (cm / ft) hard to notice.
 *
 * The pill is driven by each segment's measured layout instead of an
 * index-to-width calculation, because segments are not equal widths —
 * "ft / in" is much wider than "cm".
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  compact = false,
  style,
}: {
  options: { value: T; label: string; sublabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
  style?: ViewStyle;
}) {
  const [layouts, setLayouts] = useState<Record<string, SegmentLayout>>({});
  const selected = layouts[String(value)];

  const translateX = useSharedValue(0);
  const width = useSharedValue(0);

  // The first measurement positions the pill outright. Animating that
  // one would show it sliding in from the left edge every time the
  // screen mounts, which reads as a glitch rather than as feedback.
  const hasPositioned = useRef(false);

  useEffect(() => {
    if (!selected) return;

    if (hasPositioned.current) {
      translateX.value = withTiming(selected.x, SWITCH_TIMING);
      width.value = withTiming(selected.width, SWITCH_TIMING);
    } else {
      translateX.value = selected.x;
      width.value = selected.width;
      hasPositioned.current = true;
    }
  }, [selected?.x, selected?.width, translateX, width]);

  const pillStyle = useAnimatedStyle(() => ({
    width: width.value,
    transform: [{ translateX: translateX.value }],
    // Hidden until the first layout lands, so it never flashes at zero
    // width in the row's top-left corner.
    opacity: width.value > 0 ? 1 : 0,
  }));

  const handleLayout = useCallback((key: string, layout: SegmentLayout) => {
    setLayouts(current => {
      const previous = current[key];
      // onLayout fires on every re-render; bailing on an unchanged box
      // keeps this from looping through setState.
      if (previous && previous.x === layout.x && previous.width === layout.width) {
        return current;
      }
      return { ...current, [key]: layout };
    });
  }, []);

  return (
    <View style={[styles.segmented, compact && styles.segmentedCompact, style]}>
      {/* Inner row carries the layout; the padding stays on the wrapper
          above so a segment's measured x and the pill's own origin are
          in the same coordinate space. */}
      <View style={styles.segmentRow}>
        <Animated.View
          pointerEvents="none"
          style={[styles.segmentPill, compact && styles.segmentPillCompact, pillStyle]}
        />

        {options.map(option => (
          <Segment
            key={String(option.value)}
            label={option.label}
            sublabel={option.sublabel}
            selected={option.value === value}
            compact={compact}
            onPress={() => onChange(option.value)}
            onLayout={layout => handleLayout(String(option.value), layout)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * One segment. Split out so each can own the hooks driving its own
 * label colour — hooks cannot be called inside the map above.
 */
const Segment: React.FC<{
  label: string;
  sublabel?: string;
  selected: boolean;
  compact: boolean;
  onPress: () => void;
  onLayout: (layout: SegmentLayout) => void;
}> = ({ label, sublabel, selected, compact, onPress, onLayout }) => {
  const progress = useSharedValue(selected ? 1 : 0);

  const SEGMENT_LABEL_OFF = colors.textSecondary;
  const SEGMENT_LABEL_ON = colors.white;
  const SEGMENT_SUBLABEL_OFF = colors.textMuted;
  const SEGMENT_SUBLABEL_ON = withOpacity(colors.white, 0.85);

  useEffect(() => {
    // Matched to the pill's timing so the label turns white exactly as
    // the pill arrives under it.
    progress.value = withTiming(selected ? 1 : 0, SWITCH_TIMING);
  }, [selected, progress]);

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [SEGMENT_LABEL_OFF, SEGMENT_LABEL_ON]),
  }));

  const sublabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [SEGMENT_SUBLABEL_OFF, SEGMENT_SUBLABEL_ON]),
  }));

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      onLayout={event => {
        const { x, width } = event.nativeEvent.layout;
        onLayout({ x, width });
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.segment, compact && styles.segmentCompact]}
    >
      <Animated.Text style={[styles.segmentText, labelStyle]}>{label}</Animated.Text>
      {sublabel ? (
        <Animated.Text style={[styles.segmentSublabel, sublabelStyle]}>{sublabel}</Animated.Text>
      ) : null}
    </TouchableOpacity>
  );
};

/**
 * Minus / value / plus row for age, height and weight. Numeric keyboards
 * on Android hand back empty strings and stray separators mid-typing, so
 * these are steppers rather than text inputs — the value can never leave
 * its valid range.
 */
export const Stepper: React.FC<{
  value: string;
  unit: string;
  caption?: string;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
  accessibilityLabel: string;
}> = ({
  value,
  unit,
  caption,
  onDecrement,
  onIncrement,
  decrementDisabled,
  incrementDisabled,
  accessibilityLabel,
}) => (
  <View style={styles.stepper}>
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onDecrement}
      disabled={decrementDisabled}
      accessibilityRole="button"
      accessibilityLabel={`Decrease ${accessibilityLabel}`}
      style={[styles.stepperButton, decrementDisabled && styles.stepperButtonDisabled]}
    >
      <Minus size={18} color={colors.textPrimary} strokeWidth={2.6} />
    </TouchableOpacity>

    <View style={styles.stepperValueBlock}>
      <View style={styles.stepperValueRow}>
        <Text style={styles.stepperValue}>{value}</Text>
        <Text style={styles.stepperUnit}>{unit}</Text>
      </View>
      {caption ? <Text style={styles.stepperCaption}>{caption}</Text> : null}
    </View>

    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onIncrement}
      disabled={incrementDisabled}
      accessibilityRole="button"
      accessibilityLabel={`Increase ${accessibilityLabel}`}
      style={[styles.stepperButton, incrementDisabled && styles.stepperButtonDisabled]}
    >
      <Plus size={18} color={colors.textPrimary} strokeWidth={2.6} />
    </TouchableOpacity>
  </View>
);

/** White card with a labelled header row — wraps each metric control. */
export const FieldCard: React.FC<{
  label: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, icon, trailing, children }) => (
  <View style={styles.fieldCard}>
    <View style={styles.fieldHeader}>
      <View style={styles.fieldLabelRow}>
        {icon}
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      {trailing}
    </View>
    {children}
  </View>
);

export const PrimaryButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accent?: string;
}> = ({ label, onPress, disabled, loading, accent = colors.primary }) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={onPress}
    disabled={disabled || loading}
    accessibilityRole="button"
    style={[
      styles.primaryButton,
      { backgroundColor: accent },
      (disabled || loading) && styles.primaryButtonDisabled,
    ]}
  >
    {loading ? (
      <ActivityIndicator color={colors.white} />
    ) : (
      <>
        <Text style={styles.primaryButtonText}>{label}</Text>
        <ArrowRight size={18} color={colors.white} strokeWidth={2.6} />
      </>
    )}
  </TouchableOpacity>
);

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

const styles = themedStyles(() => ({
  stepHeader: { gap: spacing.xs },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  stepPercent: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  stepBack: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },

  titleBlock: { gap: spacing['2xs'] },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing['2xs'] },
  cardTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cardDescription: { fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  cardHint: { fontSize: 11.5, fontWeight: '700', marginTop: 2 },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  indicator: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
  },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2xs'],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLow,
  },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  chipTextSelected: { color: colors.white, fontWeight: '700' },

  segmented: {
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
  },
  // The measured row. Segments sit here, not on the padded wrapper.
  segmentRow: { flexDirection: 'row', gap: spacing['2xs'] },
  segmentPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.DEFAULT,
    backgroundColor: colors.primary,
  },
  segmentPillCompact: { borderRadius: radius.full },
  segmentedCompact: {
    padding: 3,
    borderRadius: radius.full,
    // Never wider than what is left after the label, so a long unit
    // label ("ft / in") shrinks the control rather than overflowing.
    flexShrink: 1,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.DEFAULT,
  },
  segmentCompact: {
    // Cancels the `flex: 1` above: a compact toggle sits in a card
    // header next to a label, so it must hug its own text instead of
    // splitting the row and pushing itself past the card's edge.
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    paddingVertical: 5,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.full,
  },
  segmentText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
  segmentSublabel: { fontSize: 10.5, fontWeight: '600', color: colors.textMuted },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperButtonDisabled: { opacity: 0.4 },
  stepperValueBlock: { flex: 1, alignItems: 'center' },
  stepperValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  stepperValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  stepperUnit: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  stepperCaption: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  fieldCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2xs'],
    // The label gives way first — it can wrap, the unit toggle cannot.
    flexShrink: 1,
  },
  fieldLabel: { flexShrink: 1, fontSize: 13.5, fontWeight: '700', color: colors.textPrimary },

  primaryButton: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.white,
  },
}));
