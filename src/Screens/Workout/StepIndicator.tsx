import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors } from '../../Theme/colors';

export const StepIndicator: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.bars}>
        <View style={[styles.bar, { backgroundColor: colors.primary }]} />
        <View style={[styles.bar, { backgroundColor: colors.primary }]} />
        <View style={[styles.bar, { backgroundColor: colors.primary }]} />
        <View style={[styles.bar, { backgroundColor: colors.surfaceContainerHighest }]} />
      </View>
      <View style={styles.labels}>
        <View style={styles.labelItem}>
          <Text style={[styles.label, { color: colors.primary }]}>Details </Text>
          <Check size={12} strokeWidth={3} color={colors.primary} />
        </View>
        <View style={styles.labelItem}>
          <Text style={[styles.label, { color: colors.primary }]}>Exercises </Text>
          <Check size={12} strokeWidth={3} color={colors.primary} />
        </View>
        <Text style={[styles.label, styles.labelActive]}>Schedule</Text>
        <Text style={styles.label}>Review</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 6 },
  bars: { flexDirection: 'row', gap: 8 },
  bar: { flex: 1, height: 6, borderRadius: 3 },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  labelItem: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  labelActive: { fontWeight: '800', color: colors.white },
});

export default StepIndicator;
