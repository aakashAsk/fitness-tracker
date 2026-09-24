// The last 7 days' macro completion — one percentage per day, averaging
// how far that day's protein, carbs and fiber got toward their targets.
// Feeds the dashboard's Weekly Activity bars: a day at 50% means protein,
// carbs and fiber averaged 50% of their targets that day, not that any
// one of them individually hit 50%.
import { useEffect, useState } from 'react';

import { lastNDays } from '../Services/dateRange.ts';
import { fetchMealLogsForRange, type MealLog } from '../Services/mealLogService';
import { DAILY_FIBER_GOAL_G, sumItemNutrition } from '../Services/nutritionTotals';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayLabel(dateKey: string): string {
    return DAY_LABELS[new Date(`${dateKey}T00:00:00`).getDay()];
}

export interface WeeklyMacroGram {
    /** Grams actually eaten that day. */
    grams: number;
    /** The day's target, in grams. */
    goal: number;
}

export interface WeeklyMacroDay {
    dateKey: string;
    /** Single-letter weekday, matching the bar chart's old day labels. */
    label: string;
    /** 0-1, the mean of that day's protein/carbs/fiber ratios. */
    percent: number;
    isToday: boolean;
    /** The three grams-vs-goal figures the mean above was built from —
        what a tap on the bar shows, since the bar itself only has room
        for the average. */
    protein: WeeklyMacroGram;
    carbs: WeeklyMacroGram;
    fiber: WeeklyMacroGram;
}

export interface WeeklyMacroTargets {
    proteinG: number;
    carbsG: number;
}

export interface UseWeeklyMacroCompletionResult {
    /** Oldest first, ending today. Empty while loading or on failure. */
    days: WeeklyMacroDay[];
    loading: boolean;
}

/**
 * `targets` is null until the profile has loaded — protein and carb
 * ratios cannot be computed without their goals, so the read waits
 * rather than scoring against a zero target.
 */
export function useWeeklyMacroCompletion(
    targets: WeeklyMacroTargets | null,
): UseWeeklyMacroCompletionResult {
    const [days, setDays] = useState<WeeklyMacroDay[]>([]);
    const [loading, setLoading] = useState(true);

    const proteinGoal = targets?.proteinG ?? 0;
    const carbsGoal = targets?.carbsG ?? 0;

    useEffect(() => {
        if (!targets) return;
        let cancelled = false;

        const dateKeys = lastNDays(new Date(), 7);
        const startKey = dateKeys[0];
        const endKey = dateKeys[dateKeys.length - 1];

        fetchMealLogsForRange(startKey, endKey)
            .then((mealLogs) => {
                if (cancelled) return;

                // Only completed rows count as eaten — a 'planned' row is
                // an adjustment, not food that went in, same rule
                // useDayMeals applies for today alone.
                const completedItemsByDate = new Map<string, MealLog['items']>();
                for (const log of mealLogs) {
                    if (log.state !== 'completed') continue;
                    const items = completedItemsByDate.get(log.date) ?? [];
                    completedItemsByDate.set(log.date, [...items, ...log.items]);
                }

                const computed = dateKeys.map((dateKey) => {
                    const nutrition = sumItemNutrition(completedItemsByDate.get(dateKey) ?? []);
                    const proteinG = nutrition?.protein ?? 0;
                    const carbsG = nutrition?.carbs ?? 0;
                    const fiberG = nutrition?.fiber ?? 0;

                    const proteinPercent = proteinGoal > 0 ? Math.min(proteinG / proteinGoal, 1) : 0;
                    const carbsPercent = carbsGoal > 0 ? Math.min(carbsG / carbsGoal, 1) : 0;
                    const fiberPercent = Math.min(fiberG / DAILY_FIBER_GOAL_G, 1);

                    return {
                        dateKey,
                        label: dayLabel(dateKey),
                        percent: (proteinPercent + carbsPercent + fiberPercent) / 3,
                        isToday: dateKey === endKey,
                        protein: { grams: proteinG, goal: proteinGoal },
                        carbs: { grams: carbsG, goal: carbsGoal },
                        fiber: { grams: fiberG, goal: DAILY_FIBER_GOAL_G },
                    };
                });

                setDays(computed);
            })
            .catch(() => {
                if (!cancelled) setDays([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [targets, proteinGoal, carbsGoal]);

    return { days, loading };
}

export default useWeeklyMacroCompletion;
