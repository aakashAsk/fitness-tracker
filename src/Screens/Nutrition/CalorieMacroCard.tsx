import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Flame } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

interface Macro {
  label: string;
  /** Grams eaten so far, or null when there is no estimate yet. */
  grams: number | null;
  goalGrams: number;
  color: string;
}

interface CalorieMacroCardProps {
  /** The user's derived daily target, or null before the profile loads. */
  calorieTotal: number | null;
  /** Null when the day has no completed logs with an AI estimate yet —
      distinct from a genuine zero. */
  calorieConsumed: number | null;
  /** Steps (from that day's telemetry, or the live sensor for today)
      plus any completed workouts that day. Never null — a day with
      nothing recorded yet is a real zero, not a missing figure. */
  calorieBurned: number;
  macros: Macro[];
}

// Concentric activity rings: the first entry is the outermost ring.
const CHART_SIZE = 150;
const RING_STROKE = 8;
const RING_GAP = 5;
const KNOB_RADIUS = RING_STROKE / 2 + 2;

interface RingSpec {
  label: string;
  color: string;
  /** 0–1, already clamped. */
  progress: number;
  /** "1,240 / 2,000 kcal" */
  readout: string;
}

const ConcentricRings: React.FC<{ rings: RingSpec[]; centerValue: string; centerLabel: string }> = ({
  rings,
  centerValue,
  centerLabel,
}) => {
  const center = CHART_SIZE / 2;

  return (
    <View style={styles.chartWrapper}>
      <Svg width={CHART_SIZE} height={CHART_SIZE}>
        {rings.map((ring, index) => {
          const radius = (CHART_SIZE - RING_STROKE) / 2 - index * (RING_STROKE + RING_GAP);
          const circumference = 2 * Math.PI * radius;
          // Arc starts at 12 o'clock and runs clockwise.
          const angle = -Math.PI / 2 + ring.progress * 2 * Math.PI;

          return (
            <React.Fragment key={ring.label}>
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={withOpacity(ring.color, 0.16)}
                strokeWidth={RING_STROKE}
                fill="none"
              />
              {ring.progress > 0 ? (
                <>
                  <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={ring.color}
                    strokeWidth={RING_STROKE}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - ring.progress)}
                    strokeLinecap="round"
                    fill="none"
                    rotation={-90}
                    originX={center}
                    originY={center}
                  />
                  <Circle
                    cx={center + radius * Math.cos(angle)}
                    cy={center + radius * Math.sin(angle)}
                    r={KNOB_RADIUS}
                    fill={ring.color}
                    stroke={colors.surface}
                    strokeWidth={2}
                  />
                </>
              ) : null}
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.chartCenter}>
        <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit>
          {centerValue}
        </Text>
        <Text style={styles.centerLabel}>{centerLabel}</Text>
      </View>
    </View>
  );
};

export const CalorieMacroCard: React.FC<CalorieMacroCardProps> = ({
  calorieTotal,
  calorieConsumed,
  calorieBurned,
  macros,
}) => {
  const hasTarget = calorieTotal != null;
  const hasConsumed = calorieConsumed != null;
  const kcalLeft = hasTarget && hasConsumed ? calorieTotal - calorieConsumed : null;

  const rings: RingSpec[] = [
    {
      label: 'Calories',
      color: colors.secondary,
      progress:
        hasTarget && hasConsumed && calorieTotal > 0
          ? Math.min(calorieConsumed / calorieTotal, 1)
          : 0,
      readout: `${hasConsumed ? calorieConsumed.toLocaleString() : '—'} / ${
        hasTarget ? calorieTotal.toLocaleString() : '—'
      } kcal`,
    },
    ...macros.map(macro => ({
      label: macro.label,
      color: macro.color,
      progress:
        macro.grams != null && macro.goalGrams > 0
          ? Math.min(macro.grams / macro.goalGrams, 1)
          : 0,
      readout: `${macro.grams ?? '—'} / ${macro.goalGrams > 0 ? macro.goalGrams : '—'} g`,
    })),
  ];

  return (
    <View style={styles.heroCard}>
      <View style={styles.heroHeaderRow}>
        <View>
          <Text style={styles.heroEyebrow}>DAILY BALANCE</Text>
          <Text style={styles.heroTitle}>Caloric & Macro Goals</Text>
        </View>
        <View style={styles.heroIconCircle}>
          <Flame size={18} color={colors.secondary} strokeWidth={2.4} />
        </View>
      </View>

      <View style={styles.chartRow}>
        <ConcentricRings
          rings={rings}
          centerValue={kcalLeft != null ? kcalLeft.toLocaleString() : '—'}
          centerLabel="kcal left"
        />

        <View style={styles.legend}>
          {rings.map(ring => (
            <View key={ring.label} style={styles.legendItem}>
              <View style={styles.legendTitleRow}>
                <View style={[styles.legendDot, { backgroundColor: ring.color }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>
                  {ring.label}
                </Text>
                <Text style={[styles.legendPercent, { color: ring.color }]}>
                  {Math.round(ring.progress * 100)}%
                </Text>
              </View>
              <Text style={styles.legendReadout} numberOfLines={1}>
                {ring.readout}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.summaryList}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryLeft}>
            <View style={[styles.summaryDot, { backgroundColor: colors.secondary }]} />
            <Text style={styles.summaryLabel} numberOfLines={1}>
              Consumed
            </Text>
          </View>
          <Text style={styles.summaryValue} numberOfLines={1}>
            {hasConsumed ? `${calorieConsumed.toLocaleString()} kcal` : '—'}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryLeft}>
            <View style={[styles.summaryDot, { backgroundColor: colors.textMuted }]} />
            <Text style={styles.summaryLabel} numberOfLines={1}>
              Target
            </Text>
          </View>
          <Text style={styles.summaryValue} numberOfLines={1}>
            {hasTarget ? `${calorieTotal.toLocaleString()} kcal` : '—'}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryLeft}>
            <View style={[styles.summaryDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.summaryLabel} numberOfLines={1}>
              Burned
            </Text>
          </View>
          <Text style={[styles.summaryValue, { color: colors.primary }]} numberOfLines={1}>
            {calorieBurned > 0 ? `+${calorieBurned} kcal` : '0 kcal'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = themedStyles(() => ({
  heroCard: {
    marginHorizontal: spacing.screenHorizontalPadding,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    shadowColor: colors.secondary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 3,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroEyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.secondary,
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 3,
    letterSpacing: -0.2,
  },
  heroIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withOpacity(colors.secondary, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  chartWrapper: {
    width: CHART_SIZE,
    height: CHART_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartCenter: {
    position: 'absolute',
    alignItems: 'center',
    // Inner diameter of the innermost ring, so the text never touches it.
    maxWidth: 52,
  },
  centerValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  centerLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 1,
  },
  legend: {
    flex: 1,
    gap: 10,
  },
  legendItem: {
    gap: 2,
  },
  legendTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  legendPercent: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  legendReadout: {
    marginLeft: 14,
    fontSize: 10.5,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  summaryList: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryRow: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceLow,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  summaryDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  summaryLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textSecondary,
    flexShrink: 1,
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    flexShrink: 0,
  },
}));

export default CalorieMacroCard;
