import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Droplet, Plus, X } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import { SkeletonBlock, SkeletonGroup } from '../../Components/Skeleton';
import {
  DAILY_GLASS_GOAL,
  DAILY_ML_GOAL,
  HydrationLogServiceError,
  ML_PER_GLASS,
  type HydrationEntry,
} from '../../Services/hydrationLogService';
import { themedStyles } from '../../Theme/ThemeContext';

interface HydrationCardProps {
  waterEntries: HydrationEntry[];
  waterMl: number;
  filledGlasses: number;
  canLogWater: boolean;
  hasHydrationForDay: boolean;
  onToggleGlass: (index: number) => void;
  onAddWater: (ml: number) => void;
  onRemoveEntry: (index: number) => void;
}

const HydrationSkeleton: React.FC = () => (
  <>
    <SkeletonGroup style={styles.glassesGrid}>
      {Array.from({ length: DAILY_GLASS_GOAL }).map((_, index) => (
        <View key={index} style={styles.glassColumn}>
          <SkeletonBlock height={46} radius={14} />
          <SkeletonBlock width={10} height={8} radius={4} style={styles.hydrationSkeletonIndex} />
        </View>
      ))}
    </SkeletonGroup>

    <SkeletonGroup style={styles.quickAddRow}>
      <SkeletonBlock height={42} radius={14} style={styles.hydrationSkeletonButton} />
      <SkeletonBlock height={42} radius={14} style={styles.hydrationSkeletonButton} />
    </SkeletonGroup>
  </>
);

export const HydrationCard: React.FC<HydrationCardProps> = ({
  waterEntries,
  waterMl,
  filledGlasses,
  canLogWater,
  hasHydrationForDay,
  onToggleGlass,
  onAddWater,
  onRemoveEntry,
}) => {
  const showGlasses = canLogWater || waterEntries.length > 0;

  return (
    <View style={styles.card}>
      <View style={styles.hydrationHeaderRow}>
        <View style={styles.hydrationHeaderLeft}>
          <View style={styles.hydrationIconCircle}>
            <Droplet size={16} color={colors.primary} strokeWidth={2.2} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Hydration Tracker</Text>
            <Text style={styles.cardSubtitle}>
              {!hasHydrationForDay
                ? 'Loading…'
                : `${waterMl}ml of ${DAILY_ML_GOAL}ml${
                    waterEntries.length > 0
                      ? ` · ${waterEntries.length} ${waterEntries.length === 1 ? 'drink' : 'drinks'}`
                      : ''
                  }`}
            </Text>
          </View>
        </View>
        <View style={styles.hydrationGoalPill}>
          <Text style={styles.hydrationGoalText}>
            {hasHydrationForDay ? Math.min(Math.round((waterMl / DAILY_ML_GOAL) * 100), 999) : 0}% Goal
          </Text>
        </View>
      </View>

      {!hasHydrationForDay ? <HydrationSkeleton /> : null}

      {hasHydrationForDay && showGlasses ? (
        <View style={styles.glassesGrid}>
          {Array.from({ length: DAILY_GLASS_GOAL }).map((_, index) => {
            const filled = index < filledGlasses;
            return (
              <TouchableOpacity
                key={index}
                activeOpacity={canLogWater ? 0.8 : 1}
                disabled={!canLogWater}
                onPress={() => onToggleGlass(index)}
                style={styles.glassColumn}
              >
                <View style={[styles.glassTile, filled && styles.glassTileFilled]}>
                  <Droplet
                    size={16}
                    color={filled ? colors.white : colors.textMuted}
                    strokeWidth={2.2}
                    fill={filled ? colors.white : 'none'}
                  />
                </View>
                <Text style={styles.glassIndex}>{index + 1}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {hasHydrationForDay && !showGlasses ? (
        <Text style={styles.hydrationEmptyText}>No water logged on this day.</Text>
      ) : null}

      {waterEntries.length > 0 ? (
        <View style={styles.waterLogList}>
          {waterEntries.map((entry, index) => (
            <View key={`${entry.time}-${index}`} style={styles.waterLogRow}>
              <Droplet size={13} color={colors.water} strokeWidth={2.4} fill={colors.water} />
              <Text style={styles.waterLogMl}>{entry.ml}ml</Text>
              <Text style={styles.waterLogTime}>{entry.time}</Text>
              {canLogWater ? (
                <TouchableOpacity
                  accessibilityLabel={`Remove ${entry.ml}ml at ${entry.time}`}
                  hitSlop={8}
                  onPress={() => onRemoveEntry(index)}
                >
                  <X size={14} color={colors.textMuted} strokeWidth={2.4} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {canLogWater && hasHydrationForDay ? (
        <View style={styles.quickAddRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.quickAddButton}
            onPress={() => onAddWater(ML_PER_GLASS)}
          >
            <Plus size={16} color={colors.primary} strokeWidth={2.4} />
            <Text style={styles.quickAddText}>{ML_PER_GLASS}ml Glass</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.quickAddButton}
            onPress={() => onAddWater(ML_PER_GLASS * 2)}
          >
            <Plus size={16} color={colors.primary} strokeWidth={2.4} />
            <Text style={styles.quickAddText}>{ML_PER_GLASS * 2}ml Bottle</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {hasHydrationForDay && !canLogWater ? (
        <Text style={styles.hydrationLockedText}>Water can only be logged on the day you drink it.</Text>
      ) : null}
    </View>
  );
};

const styles = themedStyles(() => ({
  card: {
    marginHorizontal: spacing.screenHorizontalPadding,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    gap: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  hydrationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  hydrationHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  hydrationIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withOpacity(colors.primary, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 2,
  },
  hydrationGoalPill: {
    backgroundColor: withOpacity(colors.primary, 0.14),
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  hydrationGoalText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  glassesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLow,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  glassColumn: {
    alignItems: 'center',
    gap: 4,
  },
  glassTile: {
    width: 28,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassTileFilled: {
    backgroundColor: colors.primary,
  },
  glassIndex: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: 10,
  },
  hydrationSkeletonIndex: { marginTop: 6 },
  hydrationSkeletonButton: { flex: 1 },
  hydrationEmptyText: {
    marginTop: 14,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  hydrationLockedText: {
    marginTop: 14,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  waterLogList: {
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  waterLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceLow,
  },
  waterLogMl: { fontSize: 12.5, fontWeight: '800', color: colors.textPrimary },
  waterLogTime: { flex: 1, fontSize: 11.5, color: colors.textSecondary },
  quickAddButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 20,
    paddingVertical: 11,
  },
  quickAddText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.primary,
  },
}));

export default HydrationCard;
