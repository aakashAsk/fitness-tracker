import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { colors, withOpacity } from '../Theme/colors';
import { Heart } from 'lucide-react-native';

export interface HeartZoneCardProps {
  bpm?: number;
  hrvMs?: number;
  statusBadge?: string;
  restingHrRange?: string;
  hrvBaselinePercent?: number;
}

export const HeartZoneCard: React.FC<HeartZoneCardProps> = ({
  bpm = 54,
  hrvMs = 68,
  statusBadge = 'PRIMED',
  restingHrRange = '52-58 bpm',
  hrvBaselinePercent = 12,
}) => {
  return (
    <View style={styles.card}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <Heart  size={14} color={colors.secondary} />
          <Text style={styles.headerTitle}>HEART & AUTONOMIC ZONE</Text>
        </View>

        <View style={styles.badgeContainer}>
          <View style={styles.purpleDot} />
          <Text style={styles.badgeText}>{statusBadge}</Text>
        </View>
      </View>

      {/* Primary Values */}
      <View style={styles.metricRow}>
        <Text style={styles.bpmValueText}>{bpm}</Text>
        <Text style={styles.bpmUnitText}>BPM</Text>
        <Text style={styles.bulletText}>•</Text>
        <Text style={styles.hrvText}>{hrvMs} ms HRV</Text>
      </View>

      {/* Waveform graphic */}
      <View style={styles.waveContainer}>
        <Svg width="100%" height={86} viewBox="0 0 340 90">
          <Defs>
            <LinearGradient id="purpleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor={colors.secondary} stopOpacity="0.35" />
              <Stop offset="65%" stopColor={colors.secondary} stopOpacity="0.08" />
              <Stop offset="100%" stopColor={colors.secondary} stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          {/* Area under curve */}
          <Path
            d="M 0,62 C 45,63 80,48 135,47 C 185,46 205,62 238,58 C 265,55 285,14 314,24 C 324,28 332,38 338,40 L 340,90 L 0,90 Z"
            fill="url(#purpleGrad)"
          />

          {/* Glowing Stroke Curve */}
          <Path
            d="M 0,62 C 45,63 80,48 135,47 C 185,46 205,62 238,58 C 265,55 285,14 314,24 C 324,28 332,38 338,40"
            fill="none"
            stroke={colors.secondary}
            strokeWidth={2.8}
            strokeLinecap="round"
          />

          {/* Endpoint marker dot */}
          <Circle
            cx="338"
            cy="40"
            r="4"
            fill={colors.white}
            stroke={colors.secondary}
            strokeWidth={2}
          />
        </Svg>
      </View>

      {/* Footer statistics */}
      <View style={styles.footerRow}>
        <View style={styles.restingHrContainer}>
          <Text style={styles.footerMutedText}>Resting HR: </Text>
          <Text style={styles.footerWhiteText}>{restingHrRange}</Text>
        </View>
        <Text style={styles.hrvBaselineText}>HRV Baseline +{hrvBaselinePercent}%</Text>
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
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.secondaryHighlight,
    borderColor: withOpacity(colors.aiRecovery, 0.4),
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  purpleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
    shadowColor: colors.secondary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.secondary,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
    gap: 6,
  },
  bpmValueText: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  bpmUnitText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primaryHighlight,
    textTransform: 'uppercase',
  },
  bulletText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginHorizontal: 2,
  },
  hrvText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.secondary,
  },
  waveContainer: {
    height: 86,
    width: '100%',
    marginTop: 8,
    overflow: 'hidden',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  restingHrContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerMutedText: {
    fontSize: 12,
    color: colors.primaryHighlight,
  },
  footerWhiteText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  hrvBaselineText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary,
  },
});
