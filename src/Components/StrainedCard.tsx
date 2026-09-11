import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../Theme/colors';

export interface DayStrainItem {
  day: string; // 'M' | 'T' | 'W' | 'T' | 'F' | 'S' | 'S'
  heightPercent: number; // e.g. 42, 68, 82, 96
  isHighLoad: boolean;
  isToday?: boolean;
}

export interface StrainCardProps {
  strainValue?: number;
  statusText?: string;
  averageValue?: number;
  highLoadDaysCount?: number;
  activeKcalPerDay?: number;
  days?: DayStrainItem[];
}

const DEFAULT_DAYS: DayStrainItem[] = [
  { day: 'M', heightPercent: 42, isHighLoad: false },
  { day: 'T', heightPercent: 68, isHighLoad: false },
  { day: 'W', heightPercent: 32, isHighLoad: false },
  { day: 'T', heightPercent: 82, isHighLoad: true },
  { day: 'F', heightPercent: 82, isHighLoad: true },
  { day: 'S', heightPercent: 96, isHighLoad: true },
  { day: 'S', heightPercent: 78, isHighLoad: true, isToday: true },
];

export const StrainCard: React.FC<StrainCardProps> = ({
  strainValue = 14.8,
  statusText = 'Optimal Strain',
  averageValue = 13.5,
  highLoadDaysCount = 3,
  activeKcalPerDay = 2450,
  days = DEFAULT_DAYS,
}) => {
  return (
    <View style={styles.card}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
              d="M23 6l-9.5 9.5-5-5L1 18"
              stroke={colors.primary}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M17 6h6v6"
              stroke={colors.primary}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={styles.headerTitle}>WEEKLY STRAIN LOAD</Text>
        </View>
        <Text style={styles.headerAvg}>Avg {averageValue.toFixed(1)}</Text>
      </View>

      {/* Primary Value */}
      <View style={styles.metricRow}>
        <Text style={styles.strainValueText}>{strainValue.toFixed(1)}</Text>
        <Text style={styles.strainStatusText}>{statusText}</Text>
      </View>

      {/* Bar Chart */}
      <View style={styles.chartContainer}>
        {days.map((item, index) => (
          <View key={`${item.day}-${index}`} style={styles.barColumn}>
            <View style={styles.barTrack}>
              {item.isToday && <View style={styles.todayIndicatorPin} />}
              <View
                style={[
                  styles.barFill,
                  { height: `${item.heightPercent}%` },
                  item.isHighLoad ? styles.barHighLoad : styles.barNormal,
                ]}
              />
            </View>
            <Text style={[styles.dayLabel, item.isToday && styles.todayDayLabel]}>
              {item.day}
            </Text>
          </View>
        ))}
      </View>

      {/* Footer statistics */}
      <View style={styles.footerRow}>
        <View style={styles.highLoadContainer}>
          <View style={styles.greenDot} />
          <Text style={styles.highLoadText}>High Load ({highLoadDaysCount}d)</Text>
        </View>
        <Text style={styles.kcalText}>
          {activeKcalPerDay.toLocaleString()} active kcal / d
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackgroud,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    marginVertical: 6,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.primaryHighlight,
    textTransform: 'uppercase',
  },
  headerAvg: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
    gap: 8,
  },
  strainValueText: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  strainStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 84,
    marginTop: 20,
    paddingHorizontal: 4,
    gap: 8,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barTrack: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
  },
  todayIndicatorPin: {
    position: 'absolute',
    top: -6,
    width: 12,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    zIndex: 10,
  },
  barFill: {
    width: '100%',
    borderRadius: 8,
  },
  barHighLoad: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  barNormal: {
    backgroundColor: colors.barNormal,
  },
  dayLabel: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  todayDayLabel: {
    color: colors.primary,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  highLoadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  highLoadText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primaryHighlight,
  },
  kcalText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
