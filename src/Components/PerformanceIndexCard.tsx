import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../Theme/colors';

export interface MetricPillItem {
  id: string;
  label: string;
  type: 'check' | 'dot';
  dotColor?: string;
  isPrimary?: boolean;
}

export interface PerformanceIndexCardProps {
  score?: number;
  maxScore?: number;
  statusText?: string;
  title?: string;
  description?: string;
  metrics?: MetricPillItem[];
}

const DEFAULT_METRICS: MetricPillItem[] = [
  { id: 'workout', label: 'Workout 89%', type: 'check', isPrimary: true },
  { id: 'nutrition', label: 'Nutrition 72%', type: 'dot', dotColor: colors.success },
  { id: 'water', label: 'Water 81%', type: 'dot', dotColor: colors.success },
  { id: 'steps', label: 'Steps 90%', type: 'check', isPrimary: true },
  { id: 'sleep', label: 'Sleep 85%', type: 'dot', dotColor: colors.aiRecovery },
];

export const PerformanceIndexCard: React.FC<PerformanceIndexCardProps> = ({
  score = 82,
  maxScore = 100,
  statusText = 'Optimal Zone',
  title = 'Daily Fitness Score',
  description = 'Your biometrics and activity indicate primed metabolic readiness.',
  metrics = DEFAULT_METRICS,
}) => {
  // SVG Ring calculation
  const size = 84;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * score) / maxScore;

  return (
    <View style={styles.card}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>PERFORMANCE INDEX</Text>
        <View style={styles.optimalZoneContainer}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
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
          <Text style={styles.optimalZoneText}>{statusText}</Text>
        </View>
      </View>

      {/* Middle Section: Progress Circle + Description */}
      <View style={styles.bodyRow}>
        {/* Circular Progress Gauge */}
        <View style={[styles.gaugeContainer, { width: size, height: size }]}>
          <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
            {/* Background track circle */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={colors.barNormal}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Progress arc */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={colors.success}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </Svg>

          {/* Value in Center */}
          <View style={styles.gaugeTextWrapper}>
            <Text style={styles.scoreText}>{score}</Text>
            <Text style={styles.maxScoreText}>/{maxScore}</Text>
          </View>
        </View>

        {/* Text info */}
        <View style={styles.infoContainer}>
          <Text style={styles.mainTitle}>{title}</Text>
          <Text style={styles.descText}>{description}</Text>
        </View>
      </View>

      {/* Metric chips / pills */}
      <View style={styles.chipsContainer}>
        {metrics.map((pill) => {
          if (pill.type === 'check') {
            return (
              <View key={pill.id} style={styles.checkPill}>
                <View style={styles.checkIconCircle}>
                  <Svg width={9} height={9} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M20 6L9 17l-5-5"
                      stroke={colors.onPrimary}
                      strokeWidth={3.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </View>
                <Text style={styles.checkPillText}>{pill.label}</Text>
              </View>
            );
          }

          return (
            <View key={pill.id} style={styles.dotPill}>
              <View
                style={[
                  styles.pillDot,
                  { backgroundColor: pill.dotColor || colors.success },
                ]}
              />
              <Text style={styles.dotPillText}>{pill.label}</Text>
            </View>
          );
        })}
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
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.primaryHighlight,
    textTransform: 'uppercase',
  },
  optimalZoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  optimalZoneText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 14,
  },
  gaugeContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  gaugeTextWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 26,
  },
  maxScoreText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.primaryHighlight,
  },
  infoContainer: {
    flex: 1,
  },
  mainTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  descText: {
    fontSize: 13,
    color: colors.primaryHighlight,
    lineHeight: 18,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  checkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.pillBackground,
    borderWidth: 1,
    borderColor: colors.pillSuccessBorder,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  checkIconCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
  },
  dotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.barNormal,
    borderWidth: 1,
    borderColor: colors.pillBorder,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
