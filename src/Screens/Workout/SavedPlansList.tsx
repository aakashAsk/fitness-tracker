import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Calendar, Dumbbell } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { spacing, radius } from '../../Theme/spacing';
import { textStyle } from '../../Theme/typography';
import { PlanItem } from './Types';

interface SavedPlansListProps {
  plans: PlanItem[];
  onActivate: (planId: string) => void;
}

export const SavedPlansList: React.FC<SavedPlansListProps> = ({ plans, onActivate }) => {
  const savedPlans = plans.filter((p) => !p.active);

  return (
    <View style={styles.container}>
      <Text style={[textStyle('labelCaps'), styles.heading]}>
        SAVED PLANS LIBRARY ({savedPlans.length})
      </Text>

      {savedPlans.map((savedPlan) => (
        <View key={savedPlan.id} style={styles.row}>
          <View style={styles.left}>
            <View style={styles.iconBox}>
              {savedPlan.id === 'ul' ? (
                <Calendar size={18} color={colors.textSecondary} />
              ) : (
                <Dumbbell size={18} color={colors.textSecondary} />
              )}
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.title} numberOfLines={1}>
                {savedPlan.title}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {savedPlan.daysPerWeek} days/week · Inactive
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => onActivate(savedPlan.id)}
            style={({ pressed }) => [styles.activateBtn, pressed && styles.pressed]}
          >
            <Text style={styles.activateText}>Activate</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 8, paddingTop: 4 },
  heading: { color: colors.textSecondary, paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    backgroundColor: colors.cardBackgroud,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.sm,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  iconBox: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerHigh,
  },
  textWrap: { flexShrink: 1 },
  title: { fontSize: 14, fontWeight: '600', color: colors.white },
  subtitle: { fontSize: 12, color: colors.textSecondary },
  activateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.DEFAULT,
    backgroundColor: colors.surfaceContainerHighest,
  },
  activateText: { fontSize: 12, fontWeight: '600', color: colors.white },
  pressed: { opacity: 0.7 },
});

export default SavedPlansList;
