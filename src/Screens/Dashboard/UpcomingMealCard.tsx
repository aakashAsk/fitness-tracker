// The dashboard's meal card — today's live meal, logged through the same
// hook the Nutrition tab uses (useDayMeals), so a meal logged here is the
// same write and shows as logged there too. Timed by the same rules as
// the workout card (sessionSchedule).
//
// The + logs the meal, but only once its time has come — nothing is
// eaten ahead of schedule. Adjusting a meal before logging lives in the
// Nutrition tab's Edit sheet; tapping the card goes there, scrolled to
// this meal.
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Check, Plus, UtensilsCrossed } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { themedStyles } from '../../Theme/ThemeContext';
import { useToday } from '../../Hooks/useNow';
import { useDayMeals } from '../../Hooks/useDayMeals';
import { MEAL_TYPE_LABEL, sumItemNutrition } from '../../Services/mealPlanService';
import { countOtherDue, describeSession, pickFocusSession } from '../../Services/sessionSchedule';

export interface UpcomingMealCardProps {
    /** Opens the Nutrition tab scrolled to this meal plan. */
    onOpenMeal?: (planId: string) => void;
    /** Opens the Nutrition tab, for when today has no meals to open. */
    onViewAll?: () => void;
}

export const UpcomingMealCard: React.FC<UpcomingMealCardProps> = ({ onOpenMeal, onViewAll }) => {
    const { now, today } = useToday();
    const { dayCards, hasLogsForDay, loggingPlanId, logMeal } = useDayMeals(today);

    const focused = hasLogsForDay ? pickFocusSession(dayCards, now) : null;
    const meal = focused?.session;
    const phase = focused?.phase;
    const otherDue = meal ? countOtherDue(dayCards, meal, now) : 0;

    const nutrition = useMemo(() => (meal ? sumItemNutrition(meal.items) : null), [meal]);
    const isLogging = !!meal && loggingPlanId === meal.planId;

    // Logging needs the plan itself; a meal whose plan was deleted still
    // shows from its row, but there is nothing left to log it against.
    const canLog = phase === 'due' && !!meal?.plan && !isLogging;

    const handleLog = () => {
        if (canLog && meal?.plan) void logMeal(meal.plan);
    };

    const open = () => {
        if (meal) onOpenMeal?.(meal.planId);
        else onViewAll?.();
    };

    const headerLabel = meal
        ? `${MEAL_TYPE_LABEL[meal.mealType]} • ${meal.time}`
        : hasLogsForDay
          ? 'Nothing planned'
          : '';

    return (
        <View style={styles.wrapper}>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Upcoming Meal</Text>
                <Text style={styles.mealTimeText}>{headerLabel}</Text>
            </View>

            <TouchableOpacity
                activeOpacity={0.9}
                onPress={open}
                style={styles.card}
                accessibilityRole="button"
                accessibilityLabel={meal ? `Open ${meal.name}` : 'Open meals'}
            >
                <View style={styles.thumbnail}>
                    <UtensilsCrossed size={24} color={colors.secondary} strokeWidth={2} />
                </View>

                <View style={styles.infoColumn}>
                    <Text style={styles.mealName} numberOfLines={1}>
                        {meal ? meal.name : hasLogsForDay ? 'No meals today' : 'Loading…'}
                    </Text>
                    {meal ? (
                        <View style={styles.metaRow}>
                            {nutrition ? (
                                <>
                                    <Text style={styles.calorieText}>
                                        {Math.round(nutrition.calories)} kcal
                                    </Text>
                                    <Text style={styles.metaSeparator}>•</Text>
                                    <Text style={styles.metaText}>
                                        {Math.round(nutrition.protein)}g Protein
                                    </Text>
                                </>
                            ) : (
                                <Text style={styles.metaText}>
                                    {meal.items.length} {meal.items.length === 1 ? 'item' : 'items'}
                                </Text>
                            )}
                        </View>
                    ) : null}
                    {meal && phase ? (
                        <Text
                            style={[
                                styles.statusText,
                                phase === 'due' && styles.statusTextDue,
                                phase === 'logged' && styles.statusTextLogged,
                            ]}
                            numberOfLines={1}
                        >
                            {describeSession(meal, phase, now)}
                            {otherDue > 0 ? ` · +${otherDue} earlier not logged` : ''}
                        </Text>
                    ) : null}
                </View>

                {meal ? (
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={handleLog}
                        disabled={!canLog}
                        accessibilityRole="button"
                        accessibilityLabel={
                            phase === 'logged'
                                ? `${meal.name} logged`
                                : phase === 'upcoming'
                                  ? `${meal.name} can be logged from ${meal.time}`
                                  : `Log ${meal.name}`
                        }
                        style={[
                            styles.logButton,
                            phase === 'logged' && styles.logButtonActive,
                            // Not yet time, or mid-save: visibly unavailable
                            // rather than a button that silently does nothing.
                            (phase === 'upcoming' || isLogging) && styles.logButtonDisabled,
                        ]}
                    >
                        {phase === 'logged' ? (
                            <Check size={20} color={colors.white} strokeWidth={2.6} />
                        ) : (
                            <Plus size={20} color={colors.secondary} strokeWidth={2.6} />
                        )}
                    </TouchableOpacity>
                ) : null}
            </TouchableOpacity>
        </View>
    );
};

const styles = themedStyles(() => ({
    wrapper: {
        gap: 10,
    },
    sectionHeaderRow: {
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
    mealTimeText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 14,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 3,
    },
    thumbnail: {
        width: 64,
        height: 64,
        borderRadius: 18,
        backgroundColor: withOpacity(colors.secondary, 0.12),
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoColumn: {
        flex: 1,
        minWidth: 0,
    },
    mealName: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
    },
    calorieText: {
        fontSize: 12.5,
        fontWeight: '800',
        color: colors.secondary,
    },
    metaSeparator: {
        color: colors.textMuted,
        fontSize: 12,
    },
    metaText: {
        fontSize: 12.5,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    logButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.secondary, 0.14),
    },
    logButtonActive: {
        backgroundColor: colors.primary,
    },
    logButtonDisabled: {
        opacity: 0.4,
    },
    statusText: {
        marginTop: 4,
        fontSize: 11.5,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    // Same tones as the workout card's status line — due asks for action,
    // logged is settled.
    statusTextDue: {
        color: colors.secondary,
        fontWeight: '800',
    },
    statusTextLogged: {
        color: colors.success,
        fontWeight: '800',
    },
}));

export default UpcomingMealCard;
