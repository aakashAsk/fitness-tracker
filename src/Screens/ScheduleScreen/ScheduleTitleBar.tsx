import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SlidersHorizontal, Plus } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { typography } from '../../Theme/typography';
import { spacing, radius } from '../../Theme/spacing';

interface ScheduleTitleBarProps {
  onFilterPress: () => void;
  onAddPress: () => void;
}

export default function ScheduleTitleBar({ onFilterPress, onAddPress }: ScheduleTitleBarProps) {
  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.title}>Schedule</Text>
        <Text style={styles.subtitle}>Plan your fitness, one day at a time.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.filterButton}
          activeOpacity={0.7}
          onPress={onFilterPress}
          accessibilityLabel="Filter schedule"
        >
          <SlidersHorizontal size={18} color={colors.onSurface} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.addButton} activeOpacity={0.85} onPress={onAddPress}>
          <Plus size={16} color={colors.onPrimaryFixed} strokeWidth={2.5} />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutterMobile,
    paddingTop: spacing.xs,
  },
  title: {
    ...typography.headlineLg,
    color: colors.onSurface,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  filterButton: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primaryContainer,
  },
  addButtonText: {
    ...typography.bodySm,
    fontWeight: '700',
    color: colors.onPrimaryFixed,
  },
});