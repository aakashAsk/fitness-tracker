// The 12-hour time picker used by every modal that schedules something
// — workout plans and meal plans.
//
// It exists because those two screens had grown separate copies of the
// same control that had drifted apart: different digit sizes, a text
// colon in one and dotted in the other, AM/PM side by side in one and
// stacked in the other, and two different accent colours. Same job,
// two answers, and a user moving between the tabs saw both.
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { colors } from '../Theme/colors';
import { radius, spacing } from '../Theme/spacing';
import { themedStyles } from '../Theme/ThemeContext';

export type Period = 'AM' | 'PM';

export interface TimeValue {
  /** 1–12. */
  hour: number;
  /** 0–59. */
  minute: number;
  period: Period;
}

export interface TimeDialProps {
  value: TimeValue;
  onChange: (next: TimeValue) => void;
  /** Minutes per press of the arrows. */
  minuteStep?: number;
}

const PERIOD_BTN_WIDTH = 48;
const PERIOD_BTN_HEIGHT = 32;
const PERIOD_GAP = 4;
const TIMING = { duration: 200 } as const;


/** Wraps rather than clamps: 12 -> 1 going up, 1 -> 12 going down. */
function cycleHour(hour: number, delta: 1 | -1): number {
  const next = hour + delta;
  if (next > 12) return 1;
  if (next < 1) return 12;
  return next;
}

function cycleMinute(minute: number, delta: 1 | -1, step: number): number {
  const next = minute + delta * step;
  if (next >= 60) return 0;
  if (next < 0) return 60 - step;
  return next;
}

export const TimeDial: React.FC<TimeDialProps> = ({ value, onChange, minuteStep = 5 }) => {
  const periodShift = useSharedValue(value.period === 'AM' ? 0 : 1);

  // Resolved here, during render, for two reasons. A useAnimatedStyle
  // callback is a worklet on the UI thread, so it may only close over
  // values — calling a JS helper from inside one throws "tried to
  // synchronously call a remote function". And reading the palette per
  // render rather than once at module load is what lets these follow a
  // theme switch.
  const PERIOD_TEXT_ON = colors.white;
  const PERIOD_TEXT_OFF = colors.textSecondary;

  useEffect(() => {
    periodShift.value = withTiming(value.period === 'AM' ? 0 : 1, TIMING);
  }, [value.period, periodShift]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: periodShift.value * (PERIOD_BTN_WIDTH + PERIOD_GAP) }],
  }));

  const amTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(periodShift.value, [0, 1], [PERIOD_TEXT_ON, PERIOD_TEXT_OFF]),
  }));

  const pmTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(periodShift.value, [0, 1], [PERIOD_TEXT_OFF, PERIOD_TEXT_ON]),
  }));

  return (
    <View style={styles.dial}>
      {/* Digits take the space left by the AM/PM tray and centre inside
          it, so the clock reads as the middle of the control. */}
      <View style={styles.clockGroup}>
        <Column
          label="HOUR"
          text={String(value.hour).padStart(2, '0')}
          onUp={() => onChange({ ...value, hour: cycleHour(value.hour, 1) })}
          onDown={() => onChange({ ...value, hour: cycleHour(value.hour, -1) })}
        />

        <View style={styles.colon}>
          <View style={styles.colonDot} />
          <View style={styles.colonDot} />
        </View>

        <Column
          label="MIN"
          text={String(value.minute).padStart(2, '0')}
          onUp={() => onChange({ ...value, minute: cycleMinute(value.minute, 1, minuteStep) })}
          onDown={() => onChange({ ...value, minute: cycleMinute(value.minute, -1, minuteStep) })}
        />
      </View>

      <View style={styles.periodWrap}>
        <Animated.View style={[styles.periodThumb, thumbStyle]} />
        {(['AM', 'PM'] as const).map(period => (
          <Pressable
            key={period}
            onPress={() => onChange({ ...value, period })}
            accessibilityRole="radio"
            accessibilityState={{ selected: value.period === period }}
            style={styles.periodBtn}
          >
            <Animated.Text
              style={[styles.periodText, period === 'AM' ? amTextStyle : pmTextStyle]}
            >
              {period}
            </Animated.Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

/** One stepper column: caret, value, caret, with a micro label. */
const Column: React.FC<{
  label: string;
  text: string;
  onUp: () => void;
  onDown: () => void;
}> = ({ label, text, onUp, onDown }) => (
  <View style={styles.column}>
    <Pressable
      accessibilityLabel={`Increase ${label.toLowerCase()}`}
      hitSlop={6}
      onPress={onUp}
      style={styles.caret}
    >
      <ChevronUp size={16} color={colors.textSecondary} strokeWidth={2.4} />
    </Pressable>

    <Text style={styles.value}>{text}</Text>
    <Text style={styles.columnLabel}>{label}</Text>

    <Pressable
      accessibilityLabel={`Decrease ${label.toLowerCase()}`}
      hitSlop={6}
      onPress={onDown}
      style={styles.caret}
    >
      <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.4} />
    </Pressable>
  </View>
);

export default TimeDial;

const styles = themedStyles(() => ({
  dial: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
  },
  clockGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },

  column: { alignItems: 'center' },
  caret: {
    width: 32,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  value: {
    minWidth: 38,
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: colors.textPrimary,
    // Explicit, with font padding off — Android otherwise seats large
    // numerals high between the two carets.
    lineHeight: 30,
    includeFontPadding: false,
  },
  columnLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.textMuted,
    marginTop: 1,
  },

  // Aligned to the digits rather than the column, which is taller now
  // that it carries a label underneath.
  colon: { gap: 5, marginBottom: 12 },
  colonDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
  },

  periodWrap: {
    flexDirection: 'row',
    gap: PERIOD_GAP,
    marginLeft: 'auto',
    padding: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  // Sits under both buttons and slides between them.
  periodThumb: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: PERIOD_BTN_WIDTH,
    height: PERIOD_BTN_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  periodBtn: {
    width: PERIOD_BTN_WIDTH,
    height: PERIOD_BTN_HEIGHT,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
}));
