import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { CalendarDays, LayoutGrid } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { typography } from '../../Theme/typography';
import { spacing, radius } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

export type ScheduleView = 'day' | 'week';

interface ViewToggleProps {
  activeView: ScheduleView;
  onChange: (view: ScheduleView) => void;
  eventsPlannedCount: number;
}

export default function ViewToggle({ activeView, onChange, eventsPlannedCount }: ViewToggleProps) {
  return (
    <View style={styles.container}>
      <View style={styles.segmentGroup}>
        <TouchableOpacity
          style={[styles.segment, activeView === 'day' && styles.segmentActive]}
          activeOpacity={0.8}
          onPress={() => onChange('day')}
        >
          <CalendarDays
            size={14}
            color={activeView === 'day' ? colors.onPrimaryFixed : colors.onSurfaceVariant}
          />
          <Text style={[styles.segmentText, activeView === 'day' && styles.segmentTextActive]}>
            Day View
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segment, activeView === 'week' && styles.segmentActive]}
          activeOpacity={0.8}
          onPress={() => onChange('week')}
        >
          <LayoutGrid
            size={14}
            color={activeView === 'week' ? colors.onPrimaryFixed : colors.onSurfaceVariant}
          />
          <Text style={[styles.segmentText, activeView === 'week' && styles.segmentTextActive]}>
            Week Matrix
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.eventsCount}>{eventsPlannedCount} EVENTS PLANNED</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutterMobile,
  },
  segmentGroup: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: 3,
    gap: 2,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md - 3,
  },
  segmentActive: {
    backgroundColor: colors.primaryContainer,
  },
  segmentText: {
    ...typography.labelRegular,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: colors.onPrimaryFixed,
  },
  eventsCount: {
    ...typography.labelCaps,
    color: colors.onSurfaceVariant,
  },
}));
