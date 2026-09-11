import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CheckCircle2, Flame, Play, LucideIcon } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { typography } from '../../Theme/typography';
import { spacing, radius } from '../../Theme/spacing';

export type BadgeVariant = 'done' | 'recovery' | 'focus';

export interface TimelineExercise {
  name: string;
  detail: string;
}

export interface TimelineCardData {
  id: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  badge?: { label: string; variant: BadgeVariant };
  description: string;
  timeRange: string;
  emphasized?: boolean; // the "main focus" hero card gets a stronger treatment
  // Hydration-only: shows a progress rail with a live time dot
  progress?: number;
  liveTimeLabel?: string;
  // Workout-only
  exercises?: TimelineExercise[];
  kcal?: string;
  onStartPress?: () => void;
}

const badgeStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  done: { bg: withOpacity(colors.primary, 0.15), text: colors.primaryContainer },
  recovery: { bg: withOpacity(colors.aiRecovery, 0.15), text: colors.secondary },
  focus: { bg: colors.primaryContainer, text: colors.onPrimaryFixed },
};

export default function TimelineCard({ data }: { data: TimelineCardData }) {
  const Icon = data.icon;
  const badge = data.badge ? badgeStyles[data.badge.variant] : null;

  return (
    <View style={[styles.card, data.emphasized && styles.cardEmphasized]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconBadge, { backgroundColor: data.iconBg }]}>
            <Icon size={16} color={data.iconColor} />
          </View>
          <View style={styles.titleGroup}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{data.title}</Text>
              {data.badge && (
                <View style={[styles.badge, { backgroundColor: badge!.bg }]}>
                  {data.badge.variant === 'done' && (
                    <CheckCircle2 size={11} color={badge!.text} />
                  )}
                  <Text style={[styles.badgeText, { color: badge!.text }]}>
                    {data.badge.label}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <Text style={styles.timeRange}>{data.timeRange}</Text>
      </View>

      <Text style={styles.description}>{data.description}</Text>

      {typeof data.progress === 'number' && (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${data.progress * 100}%` }]} />
            <View style={[styles.progressDot, { left: `${data.progress * 100}%` }]} />
          </View>
          {data.liveTimeLabel && <Text style={styles.liveTimeLabel}>{data.liveTimeLabel}</Text>}
        </View>
      )}

      {data.exercises && (
        <View style={styles.exerciseList}>
          {data.exercises.map((ex) => (
            <View key={ex.name} style={styles.exerciseRow}>
              <Text style={styles.exerciseName}>{ex.name}</Text>
              <Text style={styles.exerciseDetail}>{ex.detail}</Text>
            </View>
          ))}
        </View>
      )}

      {(data.kcal || data.onStartPress) && (
        <View style={styles.footerRow}>
          {data.kcal && (
            <View style={styles.kcalGroup}>
              <Flame size={14} color={colors.primaryContainer} />
              <Text style={styles.kcalText}>{data.kcal}</Text>
            </View>
          )}
          {data.onStartPress && (
            <TouchableOpacity
              style={styles.startButton}
              activeOpacity={0.85}
              onPress={data.onStartPress}
            >
              <Play size={14} color={colors.onPrimaryFixed} fill={colors.onPrimaryFixed} />
              <Text style={styles.startButtonText}>Start Workout</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: 8,
  },
  cardEmphasized: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: withOpacity(colors.primary, 0.25),
    padding: spacing.cardPadding - 4,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    flexShrink: 1,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.md - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleGroup: {
    flexShrink: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  title: {
    ...typography.bodyLg,
    fontWeight: '700',
    color: colors.onSurface,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgeText: {
    ...typography.labelCaps,
    fontSize: 9,
  },
  timeRange: {
    ...typography.labelRegular,
    color: colors.onSurfaceVariant,
    textAlign: 'right',
  },
  description: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
    lineHeight: 17,
  },
  progressRow: {
    gap: 6,
  },
  progressTrack: {
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    position: 'relative',
    justifyContent: 'center',
  },
  progressFill: {
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primaryContainer,
  },
  progressDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryContainer,
    marginLeft: -4,
    shadowColor: colors.primaryContainer,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  liveTimeLabel: {
    ...typography.labelRegular,
    color: colors.primaryContainer,
    fontWeight: '600',
    alignSelf: 'flex-end',
  },
  exerciseList: {
    gap: 6,
    backgroundColor: withOpacity(colors.black, 0.15),
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exerciseName: {
    ...typography.bodySm,
    color: colors.onSurface,
    fontWeight: '500',
  },
  exerciseDetail: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  kcalGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kcalText: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
    fontWeight: '500',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: spacing.sm,
    height: 36,
    borderRadius: radius.md,
    marginLeft: 'auto',
  },
  startButtonText: {
    ...typography.bodySm,
    fontWeight: '700',
    color: colors.onPrimaryFixed,
  },
});
