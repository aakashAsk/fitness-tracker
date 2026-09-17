import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Dumbbell, Clock, Play, SlidersHorizontal, PauseCircle, Flame } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing, radius } from '../../Theme/spacing';
import { textStyle } from '../../Theme/typography';
import { PlanItem } from './Types';
import { themedStyles } from '../../Theme/ThemeContext';

interface ActivePlanCardProps {
  plan: PlanItem;
  isPaused: boolean;
  onStartWorkout: () => void;
  onEditPlan: () => void;
  onTogglePause: () => void;
}

export const ActivePlanCard: React.FC<ActivePlanCardProps> = ({
  plan,
  isPaused,
  onStartWorkout,
  onEditPlan,
  onTogglePause,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.inner}>
        {/* Top Row: Plan Name & Active Pill */}
        <View style={styles.topRow}>
          <View style={styles.titleWrap}>
            <View>
              <Dumbbell size={18} color={colors.primaryContainer} />
            </View>
            <Text style={styles.title}>{plan.title}</Text>
          </View>

          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isPaused ? colors.warning : colors.pillText },
              ]}
            />
            <Text style={styles.statusText}>{isPaused ? 'PAUSED' : 'ACTIVE'}</Text>
          </View>
        </View>

        {/* Metadata Tags */}
        <View style={styles.metaRow}>
          <Text style={styles.metaTag}>{plan.daysPerWeek} Days / Week</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaTag}>{plan.scheduleDays}</Text>
          <Text style={styles.metaDot}>•</Text>
          <View style={[styles.metaTag, styles.metaTagRow]}>
            <Clock size={13} color={colors.white} />
            <Text style={styles.metaTagText}>{plan.time}</Text>
          </View>
        </View>

        {/* Next Workout Highlight Callout */}
        <View style={styles.callout}>
          <View style={styles.calloutHeader}>
            <Text style={[textStyle('labelCaps'), { color: colors.primary }]}>
              NEXT SCHEDULED WORKOUT
            </Text>
            <Text style={styles.calloutMeta}>Tomorrow</Text>
          </View>
          <Text style={styles.calloutTitle}>Push Day: Hypertrophy Focus</Text>
          <View style={styles.calloutFooter}>
            <Flame size={13} color={colors.textSecondary} />
            <Text style={[textStyle('bodySm'), { color: colors.textSecondary }]}>
              Chest, Shoulders, Triceps · 5 exercises (55 min)
            </Text>
          </View>
        </View>

        {/* Plan Card Controls */}
        <View style={styles.controls}>
          <Pressable
            onPress={onStartWorkout}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          >
            <Play size={16} fill={colors.onPrimary} color={colors.onPrimary} />
            <Text style={styles.primaryBtnText}>Start Push Workout</Text>
          </Pressable>

          <View style={styles.controlRow}>
            <Pressable
              onPress={onEditPlan}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            >
              <SlidersHorizontal size={15} color={colors.white} />
              <Text style={styles.secondaryBtnText}>Edit Plan</Text>
            </Pressable>

            <Pressable
              onPress={onTogglePause}
              style={({ pressed }) => [
                styles.secondaryBtn,
                isPaused && styles.pauseActive,
                pressed && styles.pressed,
              ]}
            >
              <PauseCircle size={15} color={isPaused ? colors.warning : colors.textSecondary} />
              <Text
                style={[
                  styles.secondaryBtnText,
                  { color: isPaused ? colors.warning : colors.textSecondary },
                ]}
              >
                {isPaused ? 'Resume Plan' : 'Pause Plan'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = themedStyles(() => ({
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    padding: spacing.cardPadding,
    overflow: 'hidden',
  },
  inner: { gap: 16 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  iconBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.pillBackground,
    borderWidth: 1,
    borderColor: withOpacity(colors.success, 0.4),
  },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: colors.white, flexShrink: 1 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.pillBackground,
    borderWidth: 1,
    borderColor: colors.pillSuccessBorder
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    color: colors.pillText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  metaTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerHigh,
    color: colors.white,
    fontSize: 12,
    fontWeight: '500',
    overflow: 'hidden',
  },
  metaTagRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTagText: { color: colors.white, fontSize: 12, fontWeight: '500' },
  metaDot: { color: colors.textMuted, fontSize: 12 },
  callout: {
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: withOpacity(colors.surfaceContainerHigh, 0.9),
    borderWidth: 1,
    borderColor: withOpacity(colors.white, 0.04),
    padding: 14,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calloutMeta: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  calloutTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  calloutFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  controls: { gap: 8, paddingTop: 4 },
  primaryBtn: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: colors.onPrimary, fontSize: 14, fontWeight: '800' },
  controlRow: { flexDirection: 'row', gap: 8 },
  secondaryBtn: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerHighest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryBtnText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  pauseActive: {
    backgroundColor: withOpacity(colors.warning, 0.2),
    borderWidth: 1,
    borderColor: withOpacity(colors.warning, 0.4),
  },
  pressed: { opacity: 0.85 },
}));

export default ActivePlanCard;
