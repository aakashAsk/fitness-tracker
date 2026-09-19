import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Check, CheckCircle, Clock, SquarePen, UtensilsCrossed } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import { SkeletonCard } from '../../Components/Skeleton';
import {
  MEAL_TYPE_LABEL,
  sumItemNutrition,
  type MealPlan,
} from '../../Services/mealPlanService';
import { describeSession, type SessionPhase } from '../../Services/sessionSchedule';
import { themedStyles } from '../../Theme/ThemeContext';

interface MealCard {
  planId: string;
  name: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  plan: MealPlan | null;
  items: Array<{ name: string; nutrition?: { protein: number; calories: number } }>;
  time: string;
  isLogged: boolean;
}

interface MealLogCardProps {
  dayCards: MealCard[];
  hasLogsForDay: boolean;
  isToday: boolean;
  loggingPlanId: string | null;
  estimatingIds: string[];
  onLogMeal: (plan: MealPlan) => void;
  onEditMeal: (plan: MealPlan) => void;
  onFocusItem: (planId: string) => (e: any) => void;
}

const formatGrams = (value: number): string => {
  if (value >= 10) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
};

const MealSkeleton: React.FC<{ rows: number }> = ({ rows }) => (
  <>
    {Array.from({ length: rows }).map((_, index) => (
      <SkeletonCard key={index} withFooter />
    ))}
  </>
);

export const MealLogsCard: React.FC<MealLogCardProps> = ({
  dayCards,
  hasLogsForDay,
  isToday,
  loggingPlanId,
  estimatingIds,
  onLogMeal,
  onEditMeal,
  onFocusItem,
}) => {
  return (
    <View style={styles.mealsSection}>
      <View style={styles.mealsHeaderRow}>
        <Text style={styles.sectionTitle}>
          {isToday ? "Today's Meals" : 'Planned Meals'}
        </Text>
        <Text style={styles.mealsHeaderKcal}>
          {dayCards.length} {dayCards.length === 1 ? 'meal' : 'meals'}
        </Text>
      </View>

      {!hasLogsForDay ? (
        <MealSkeleton rows={Math.max(dayCards.length, 2)} />
      ) : dayCards.length === 0 ? (
        <View style={styles.mealEmptyCard}>
          <Text style={styles.mealEmptyTitle}>No meals planned</Text>
          <Text style={styles.mealEmptySubtitle}>
            Tap "Create Meal Plan" to add one. Plans repeat on the days you pick, so they show up here
            automatically.
          </Text>
        </View>
      ) : (
        dayCards.map((card) => {
          const { isLogged, items: shownItems, time: shownTime } = card;
          const nutrition = sumItemNutrition(shownItems);
          const isEstimating = estimatingIds.includes(card.planId);
          const phase: SessionPhase = isLogged ? 'logged' : 'upcoming';
          const canLog = phase === 'due' && !!card.plan && !isEstimating;

          return (
            <View key={card.planId} style={styles.mealCard} onLayout={onFocusItem(card.planId)}>
              <View style={styles.mealTopRow}>
                <View style={styles.mealThumbnail}>
                  <UtensilsCrossed size={22} color={colors.secondary} strokeWidth={1.8} />
                </View>
                <View style={styles.mealInfo}>
                  <View style={styles.mealTitleRow}>
                    <Text style={styles.mealName} numberOfLines={1}>
                      {card.name}
                    </Text>
                    {isLogged ? (
                      <View style={styles.mealLoggedPill}>
                        <CheckCircle size={11} color={colors.success} strokeWidth={2.6} />
                        <Text style={styles.mealLoggedText}>{shownTime}</Text>
                      </View>
                    ) : (
                      <View style={styles.mealStatusPillUpcoming}>
                        <Clock size={11} color={colors.secondary} strokeWidth={2.4} />
                        <Text style={styles.mealStatusTextUpcoming}>{shownTime}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.mealDescription} numberOfLines={2}>
                    {shownItems.map((item) => item.name).join(', ')}
                  </Text>
                  <Text style={styles.mealCalories}>
                    {MEAL_TYPE_LABEL[card.mealType]} · {shownItems.length}{' '}
                    {shownItems.length === 1 ? 'item' : 'items'}
                  </Text>
                </View>
              </View>

              {isEstimating ? (
                <Text style={styles.macroPending}>Estimating nutrition…</Text>
              ) : nutrition ? (
                <View style={styles.mealMacroRow}>
                  <View style={styles.macroKcal}>
                    <Text style={styles.macroKcalValue}>{Math.round(nutrition.calories)}</Text>
                    <Text style={styles.macroKcalUnit}>kcal</Text>
                  </View>
                  {(
                    [
                      ['P', nutrition.protein, colors.protein],
                      ['C', nutrition.carbs, colors.carbs],
                      ['F', nutrition.fat, colors.fats],
                      ['Fib', nutrition.fiber, colors.success],
                      ['Sug', nutrition.sugar, colors.cardio],
                    ] as const
                  ).map(([label, grams, tone]) => (
                    <View key={label} style={styles.macroChip}>
                      <Text style={[styles.macroChipLabel, { color: tone }]}>{label}</Text>
                      <Text style={styles.macroChipValue}>{formatGrams(grams)}g</Text>
                    </View>
                  ))}
                  {nutrition.estimated < nutrition.total ? (
                    <Text style={styles.macroRough}>
                      {nutrition.estimated}/{nutrition.total} items
                    </Text>
                  ) : nutrition.confidence < 0.6 ? (
                    <Text style={styles.macroRough}>approx</Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.mealActionRow}>
                {isLogged ? (
                  <View style={styles.mealDoneChip}>
                    <Check size={13} color={colors.success} strokeWidth={3} />
                    <Text style={styles.mealDoneText}>Logged</Text>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={!card.plan || loggingPlanId === card.planId}
                      onPress={() => card.plan && onLogMeal(card.plan)}
                      style={[
                        styles.mealLogButton,
                        (!card.plan || loggingPlanId === card.planId) && styles.mealLogButtonBusy,
                      ]}
                    >
                      <Check size={14} color={colors.white} strokeWidth={3} />
                      <Text style={styles.mealLogText}>
                        {loggingPlanId === card.planId ? 'Saving…' : 'Log Meal'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={!card.plan}
                      onPress={() => card.plan && onEditMeal(card.plan)}
                      style={[styles.mealEditButton, !card.plan && styles.mealLogButtonBusy]}
                    >
                      <SquarePen size={13} color={colors.secondary} strokeWidth={2.4} />
                      <Text style={styles.mealEditText}>Edit</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
};

const styles = themedStyles(() => ({
  mealsSection: {
    marginHorizontal: spacing.screenHorizontalPadding,
    gap: 12,
  },
  mealsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  mealsHeaderKcal: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.secondary,
  },
  mealLoggedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: withOpacity(colors.success, 0.14),
  },
  mealLoggedText: { fontSize: 10, fontWeight: '800', color: colors.success },
  macroPending: {
    marginTop: 12,
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  mealMacroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  macroKcal: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: withOpacity(colors.secondary, 0.14),
  },
  macroKcalValue: { fontSize: 13, fontWeight: '800', color: colors.secondary },
  macroKcalUnit: { fontSize: 9.5, fontWeight: '700', color: colors.secondary },
  macroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: colors.surfaceLow,
  },
  macroChipLabel: { fontSize: 10, fontWeight: '800' },
  macroChipValue: { fontSize: 11.5, fontWeight: '700', color: colors.textPrimary },
  macroRough: {
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.textMuted,
  },
  mealActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  mealLogButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.secondary,
  },
  mealLogButtonBusy: { opacity: 0.6 },
  mealLogText: { fontSize: 13, fontWeight: '800', color: colors.white },
  mealDoneChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: withOpacity(colors.success, 0.14),
  },
  mealDoneText: { fontSize: 13, fontWeight: '800', color: colors.success },
  mealEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: withOpacity(colors.secondary, 0.14),
  },
  mealEditText: { fontSize: 13, fontWeight: '800', color: colors.secondary },
  mealEmptyCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.surfaceLow,
    gap: 5,
  },
  mealEmptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  mealEmptySubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  mealCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 14,
    gap: 10,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  mealTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: withOpacity(colors.secondary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealInfo: {
    flex: 1,
    minWidth: 0,
  },
  mealTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealName: {
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  mealStatusPillUpcoming: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: withOpacity(colors.secondary, 0.16),
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  mealStatusTextUpcoming: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.secondary,
  },
  mealDescription: {
    fontSize: 12.5,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 3,
  },
  mealCalories: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.secondary,
    marginTop: 4,
  },
}));

export default MealLogsCard;
