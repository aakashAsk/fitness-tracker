import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Clock } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';
import { DURATION_OPTIONS } from './Data';

interface ScheduleTimeSelectorProps {
  targetHour: string;
  targetMinute: string;
  targetPeriod: 'AM' | 'PM';
  onTargetPeriodChange: (period: 'AM' | 'PM') => void;
  sessionDuration: string;
  onSessionDurationChange: (duration: string) => void;
}

export const ScheduleTimeSelector: React.FC<ScheduleTimeSelectorProps> = ({
  targetHour,
  targetMinute,
  targetPeriod,
  onTargetPeriodChange,
  sessionDuration,
  onSessionDurationChange,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Target Gym Time</Text>
          <Text style={styles.subtitle}>
            Synchronizes with your smart device notification
          </Text>
        </View>
        <Clock size={18} color={colors.white} />
      </View>

      {/* Smartphone Clock Dial Display */}
      <View style={styles.dial}>
        <View style={styles.timeWrap}>
          <View style={styles.timeBox}>
            <Text style={styles.timeText}>{targetHour}</Text>
          </View>
          <Text style={styles.colon}>:</Text>
          <View style={styles.timeBox}>
            <Text style={styles.timeText}>{targetMinute}</Text>
          </View>
        </View>

        {/* AM / PM Selector Toggle */}
        <View style={styles.periodWrap}>
          {(['AM', 'PM'] as const).map((period) => {
            const isSelected = targetPeriod === period;
            return (
              <Pressable
                key={period}
                onPress={() => onTargetPeriodChange(period)}
                style={[styles.periodBtn, isSelected ? styles.periodActive : styles.periodIdle]}
              >
                <Text
                  style={[
                    styles.periodText,
                    { color: isSelected ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  {period}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Workout Duration Selector */}
      <View style={styles.durationWrap}>
        <Text style={styles.durationLabel}>ESTIMATED SESSION DURATION</Text>
        <View style={styles.durationRow}>
          {DURATION_OPTIONS.map((dur: any) => {
            const isSelected = sessionDuration === dur;
            return (
              <Pressable
                key={dur}
                onPress={() => onSessionDurationChange(dur)}
                style={[styles.durationBtn, isSelected ? styles.durationActive : styles.durationIdle]}
              >
                <Text
                  style={[
                    styles.durationText,
                    { color: isSelected ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  {dur}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 16, paddingTop: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: { flexShrink: 1 },
  title: { fontSize: 14, fontWeight: '700', color: colors.white },
  subtitle: { fontSize: 12, color: colors.textSecondary },
  dial: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: radius.md,
    backgroundColor: colors.cardBackgroud,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
  },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeBox: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: withOpacity(colors.white, 0.05),
  },
  timeText: { fontSize: 30, fontWeight: '900', letterSpacing: -0.5, color: colors.white },
  colon: { fontSize: 30, fontWeight: '900', color: colors.primary },
  periodWrap: { gap: 4, marginLeft: 8 },
  periodBtn: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodActive: { backgroundColor: colors.primary },
  periodIdle: { backgroundColor: colors.surfaceContainerHighest },
  periodText: { fontSize: 10, fontWeight: '700' },
  durationWrap: { gap: 8 },
  durationLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.textSecondary },
  durationRow: { flexDirection: 'row', gap: 6 },
  durationBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationActive: { backgroundColor: colors.primary },
  durationIdle: {
    backgroundColor: colors.cardBackgroud,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  durationText: { fontSize: 12, fontWeight: '600' },
});

export default ScheduleTimeSelector;
