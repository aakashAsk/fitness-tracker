import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { BellRing, Repeat } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';
import { REMINDER_OFFSET_OPTIONS } from './Data';
import { themedStyles } from '../../Theme/ThemeContext';

interface SessionReminderProps {
  enabled: boolean;
  onToggle: () => void;
  offset: string;
  onOffsetChange: (offset: string) => void;
}

export const SessionReminder: React.FC<SessionReminderProps> = ({ enabled, onToggle, offset, onOffsetChange }) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <BellRing size={18} color={colors.white} />
          <Text style={styles.title}>Session Reminder</Text>
        </View>

        {/* Active Switch */}
        <Pressable
          onPress={onToggle}
          style={[
            styles.switch,
            {
              backgroundColor: enabled ? colors.primary : colors.surfaceContainerHighest,
              alignItems: enabled ? 'flex-end' : 'flex-start',
            },
          ]}
        >
          <View style={styles.knob} />
        </Pressable>
      </View>

      {enabled && (
        <View style={styles.offsetRow}>
          <Text style={styles.offsetLabel}>Alert me before workout:</Text>
          <View style={styles.offsetBtns}>
            {REMINDER_OFFSET_OPTIONS.map((opt: any) => {
              const isSelected = offset === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => onOffsetChange(opt)}
                  style={[styles.offsetBtn, isSelected ? styles.offsetActive : styles.offsetIdle]}
                >
                  <Text
                    style={[
                      styles.offsetText,
                      { color: isSelected ? colors.onPrimary : colors.textSecondary },
                    ]}
                  >
                    {opt}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Cadence Info Tag */}
      <View style={styles.infoRow}>
        <Repeat size={14} color={colors.textSecondary} />
        <Text style={styles.infoText}>Repeats every week on selected training days</Text>
      </View>
    </View>
  );
};

const styles = themedStyles(() => ({
  container: {
    gap: 12,
    borderRadius: radius.md,
    backgroundColor: colors.cardBackgroud,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '700', color: colors.white },
  switch: {
    width: 48,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  offsetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  offsetLabel: { fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  offsetBtns: { flexDirection: 'row', gap: 4 },
  offsetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.DEFAULT,
  },
  offsetActive: { backgroundColor: colors.primary },
  offsetIdle: { backgroundColor: colors.surfaceContainerHigh },
  offsetText: { fontSize: 10, fontWeight: '700' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 12, color: colors.textSecondary },
}));

export default SessionReminder;
