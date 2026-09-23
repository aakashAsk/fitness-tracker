// Net calories (eaten − burned) for the dashboard's hero chart, bucketed
// by the selected range.
//
// Burned combines two independent sources that must never share a
// storage field (see telemetryService's recordDailyMetrics, which is
// re-written from the pedometer on every dashboard render and would
// clobber a workout's contribution if they shared one):
//  - steps: already-persisted TelemetryDay.caloriesBurned, the
//    step-derived figure the dashboard itself writes each day it is
//    opened.
//  - workouts: WorkoutLog.stats.caloriesBurned, computed and stored on
//    the log itself at save time — summed here per day, not merged into
//    telemetry.
// Eaten is the sum of that day's completed MealLog items.
import { useEffect, useMemo, useState } from 'react';

import { fetchTelemetryRange } from '../Services/telemetryService';
import { fetchMealLogsForRange } from '../Services/mealLogService';
import { fetchWorkoutLogsForRange, toDateKey } from '../Services/workoutLogService';
import { sumItemNutrition } from '../Services/nutritionTotals';

export type NetCaloriesRange = 'week' | 'month' | 'year';

export interface NetCaloriesBucket {
    label: string;
    /** Eaten minus burned for the bucket. Can be negative (a deficit).
     * Null when the bucket is entirely in the future (nothing has
     * happened yet to sum) — distinct from a real net of 0. */
    net: number | null;
}

export interface UseNetCaloriesResult {
    buckets: NetCaloriesBucket[];
    loading: boolean;
}

const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'];
const YEAR_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

/** [start, end] date keys plus every date key in between, for one range
 * anchored on today — the current Sun–Sat week, the current calendar
 * month split into four ~7-day chunks, or the current calendar year
 * split into twelve months. Every bucket for the full period is
 * included (all 7 weekdays, all 4 weeks, all 12 months) even when part
 * of it is still in the future — see useNetCalories, which sums only
 * each bucket's PAST days and marks a bucket net `null` once none of
 * its days have happened yet, so the chart can show every label while
 * only drawing the line up to today. */
function rangeDates(range: NetCaloriesRange, today: Date): string[][] {
    if (range === 'week') {
        const weekStart = addDays(today, -today.getDay());
        // One bucket PER DAY, not one bucket holding all 7 days — each
        // weekday gets its own point on the chart.
        return Array.from({ length: 7 }, (_, i) => [toDateKey(addDays(weekStart, i))]);
    }
    if (range === 'month') {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const buckets: string[][] = [];
        for (let week = 0; week < 4; week++) {
            const from = week * 7 + 1;
            // The last bucket absorbs whatever the month has left (29-31
            // days never split evenly into four 7-day weeks).
            const to = week === 3 ? daysInMonth : Math.min(from + 6, daysInMonth);
            const days: string[] = [];
            for (let day = from; day <= to; day++) {
                days.push(toDateKey(new Date(monthStart.getFullYear(), monthStart.getMonth(), day)));
            }
            buckets.push(days);
        }
        return buckets;
    }
    // year
    return Array.from({ length: 12 }, (_, month) => {
        const daysInMonth = new Date(today.getFullYear(), month + 1, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, day) =>
            toDateKey(new Date(today.getFullYear(), month, day + 1)),
        );
    });
}

/**
 * Net calories (eaten − burned), bucketed for `range` and anchored on
 * today. Refetches whenever `range` or `refreshKey` changes — pass a
 * changing `refreshKey` after logging a meal or workout so the chart
 * picks it up without waiting for the range caches to expire on their own.
 */
export function useNetCalories(range: NetCaloriesRange, refreshKey = 0): UseNetCaloriesResult {
    const [state, setState] = useState<{ range: NetCaloriesRange; buckets: NetCaloriesBucket[] } | null>(
        null,
    );

    // Recomputed only when the calendar day actually changes, not on every
    // render — the buckets a "week" or "year" range covers must not shift
    // mid-session just because a re-render happened after midnight.
    const today = useMemo(() => new Date(), []);

    useEffect(() => {
        let cancelled = false;
        const todayKey = toDateKey(today);
        const buckets = rangeDates(range, today);
        const startDate = buckets[0][0];
        const endDate = buckets[buckets.length - 1][buckets[buckets.length - 1].length - 1];
        const labels = range === 'week' ? WEEK_LABELS : range === 'month' ? MONTH_LABELS : YEAR_LABELS;

        Promise.all([
            fetchMealLogsForRange(startDate, endDate),
            fetchWorkoutLogsForRange(startDate, endDate),
            fetchTelemetryRange(startDate, endDate),
        ])
            .then(([mealLogs, workoutLogs, telemetryDays]) => {
                if (cancelled) return;

                const eatenByDate = new Map<string, number>();
                for (const log of mealLogs) {
                    if (log.state !== 'completed') continue;
                    const calories = sumItemNutrition(log.items)?.calories ?? 0;
                    eatenByDate.set(log.date, (eatenByDate.get(log.date) ?? 0) + calories);
                }

                const workoutBurnByDate = new Map<string, number>();
                for (const log of workoutLogs) {
                    if (log.state !== 'completed' || !log.stats) continue;
                    workoutBurnByDate.set(
                        log.date,
                        (workoutBurnByDate.get(log.date) ?? 0) + log.stats.caloriesBurned,
                    );
                }

                const stepBurnByDate = new Map<string, number>();
                for (const day of telemetryDays) {
                    stepBurnByDate.set(day.date, day.caloriesBurned ?? 0);
                }

                const result = buckets.map((days, i) => {
                    // Only days that have actually happened count toward
                    // the bucket's net — a day after today has nothing to
                    // sum, not a real zero.
                    const pastDays = days.filter((d) => d <= todayKey);
                    if (pastDays.length === 0) return { label: labels[i], net: null };

                    const net = pastDays.reduce((sum, dateKey) => {
                        const eaten = eatenByDate.get(dateKey) ?? 0;
                        const burned =
                            (stepBurnByDate.get(dateKey) ?? 0) + (workoutBurnByDate.get(dateKey) ?? 0);
                        return sum + (eaten - burned);
                    }, 0);
                    return { label: labels[i], net: Math.round(net) };
                });

                setState({ range, buckets: result });
            })
            .catch(() => {
                // A failed history read must not crash the dashboard's hero
                // chart — it just stays on whatever it last showed (or
                // empty, on a first failed load).
                if (!cancelled) setState((prev) => prev ?? { range, buckets: [] });
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range, today, refreshKey]);

    return {
        buckets: state?.range === range ? state.buckets : [],
        loading: state?.range !== range,
    };
}

export default useNetCalories;
