import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Flame } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

interface Macro {
  label: string;
  percent: number;
  grams: number;
  goalGrams: number;
  color: string;
}

interface CalorieMacroCardProps {
  calorieTotal: number;
  calorieConsumed: number;
  calorieBurned: number;
  macros: Macro[];
}

const RING_SIZE = 120;
const RING_STROKE = 9;

export const CalorieMacroCard: React.FC<CalorieMacroCardProps> = ({
  calorieTotal,
  calorieConsumed,
  calorieBurned,
  macros,
}) => {
  const kcalLeft = calorieTotal - calorieConsumed;
  const ringRadius = (RING_SIZE - RING_STROKE) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringPercent = Math.min(calorieConsumed / calorieTotal, 1);
  const ringDashOffset = ringCircumference * (1 - ringPercent);

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

      <View style={styles.ringSummaryRow}>
        <View style={styles.ringWrapper}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={ringRadius}
              stroke={withOpacity(colors.secondary, 0.16)}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={ringRadius}
              stroke={colors.secondary}
              strokeWidth={RING_STROKE}
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringDashOffset}
              strokeLinecap="round"
              fill="none"
              rotation={-90}
              originX={RING_SIZE / 2}
              originY={RING_SIZE / 2}
            />
          </Svg>
          <View style={styles.ringTextWrap}>
            <Text style={styles.ringValue}>{kcalLeft.toLocaleString()}</Text>
            <Text style={styles.ringLabel}>kcal left</Text>
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
              {calorieConsumed.toLocaleString()} kcal
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
              {calorieTotal.toLocaleString()} kcal
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
              +{calorieBurned} kcal
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.macroRow}>
        {macros.map((macro) => (
          <View key={macro.label} style={styles.macroColumn}>
            <View style={styles.macroHeaderRow}>
              <Text style={styles.macroLabel}>{macro.label}</Text>
              <Text style={[styles.macroPercent, { color: macro.color }]}>{macro.percent}%</Text>
            </View>
            <View style={styles.macroTrack}>
              <View
                style={[
                  styles.macroFill,
                  { width: `${macro.percent}%`, backgroundColor: macro.color },
                ]}
              />
            </View>
            <Text style={styles.macroGrams}>
              {macro.grams}
              <Text style={styles.macroGramsGoal}>/{macro.goalGrams}g</Text>
            </Text>
          </View>
        ))}
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
  ringSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ringWrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTextWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringValue: {
    fontSize: 23,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  ringLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  summaryList: {
    flex: 1,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLow,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    marginRight: 6,
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
  macroRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  macroColumn: {
    flex: 1,
    gap: 6,
  },
  macroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  macroLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  macroPercent: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  macroTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.surfaceContainer,
    overflow: 'hidden',
  },
  macroFill: {
    height: '100%',
    borderRadius: 4,
  },
  macroGrams: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  macroGramsGoal: {
    fontWeight: '500',
    color: colors.textSecondary,
  },
}));

export default CalorieMacroCard;
