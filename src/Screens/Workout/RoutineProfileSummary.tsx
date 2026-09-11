import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';
import { textStyle } from '../../Theme/typography';

const SELECTED_MUSCLES = ['Chest', 'Shoulders', 'Triceps'];
const UNSELECTED_MUSCLES = ['Back', 'Biceps', 'Legs'];

interface RoutineProfileSummaryProps {
  onEdit: () => void;
}

export const RoutineProfileSummary: React.FC<RoutineProfileSummaryProps> = ({ onEdit }) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[textStyle('labelCaps'), { color: colors.textSecondary }]}>
          SELECTED ROUTINE PROFILE
        </Text>
        <Pressable onPress={onEdit} hitSlop={8}>
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
      </View>

      <View style={styles.nameRow}>
        <Text style={styles.name}>Hypertrophy PPL</Text>
        <Text style={styles.dot}>•</Text>
        <Text style={styles.goal}>Muscle Gain</Text>
      </View>

      <View style={styles.pillsRow}>
        {SELECTED_MUSCLES.map((muscle) => (
          <View key={muscle} style={styles.pillSelected}>
            <Check size={11} strokeWidth={2.8} color={colors.primary} />
            <Text style={styles.pillSelectedText}> {muscle}</Text>
          </View>
        ))}
        {UNSELECTED_MUSCLES.map((muscle) => (
          <View key={muscle} style={styles.pillMuted}>
            <Text style={styles.pillMutedText}>{muscle}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
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
  editText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 14, fontWeight: '700', color: colors.white },
  dot: { color: colors.textMuted },
  goal: { fontSize: 12, color: colors.textSecondary },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
  pillSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.pillBackground,
    borderWidth: 1,
    borderColor: withOpacity(colors.success, 0.4),
  },
  pillSelectedText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  pillMuted: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
  },
  pillMutedText: { color: colors.textSecondary, fontSize: 11, fontWeight: '500' },
});

export default RoutineProfileSummary;
