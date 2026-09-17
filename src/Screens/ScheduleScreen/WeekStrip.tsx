import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { colors } from '../../Theme/colors';
import { typography } from '../../Theme/typography';
import { spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

export interface WeekDay {
  label: string; // MON, TUE...
  dayNumber: number;
  dotCount: 0 | 1 | 2 | 3;
  isActive?: boolean;
}

interface WeekStripProps {
  days: WeekDay[];
  onSelectDay: (day: WeekDay) => void;
}

export default function WeekStrip({ days, onSelectDay }: WeekStripProps) {
  return (
    <View style={styles.container}>
      {days.map((day) => (
        <TouchableOpacity
          key={day.label}
          style={styles.dayColumn}
          activeOpacity={0.7}
          onPress={() => onSelectDay(day)}
        >
          <Text style={[styles.dayLabel, day.isActive && styles.dayLabelActive]}>
            {day.label}
          </Text>

          <View style={[styles.dayCircle, day.isActive && styles.dayCircleActive]}>
            <Text style={[styles.dayNumber, day.isActive && styles.dayNumberActive]}>
              {day.dayNumber}
            </Text>
          </View>

          <View style={styles.dotsRow}>
            {Array.from({ length: day.dotCount }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, day.isActive && styles.dotActive]}
              />
            ))}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutterMobile,
  },
  dayColumn: {
    alignItems: 'center',
    gap: 6,
    width: 40,
  },
  dayLabel: {
    ...typography.labelCaps,
    fontSize: 10,
    color: colors.onSurfaceVariant,
  },
  dayLabelActive: {
    color: colors.primaryContainer,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLow,
  },
  dayCircleActive: {
    backgroundColor: colors.primaryContainer,
    shadowColor: colors.primaryContainer,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  dayNumber: {
    ...typography.bodyMd,
    fontWeight: '700',
    color: colors.onSurface,
  },
  dayNumberActive: {
    color: colors.onPrimaryFixed,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 3,
    height: 4,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.onSurfaceVariant,
  },
  dotActive: {
    backgroundColor: colors.primaryContainer,
  },
}));
