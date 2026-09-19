// The meals on one date, and the two things a user can do with one:
// log it, or adjust it for that day before logging.
//
// Lifted out of NutritionScreen unchanged so the dashboard's meal card
// runs the exact rules the Nutrition tab does — a meal logged from
// either place is the same write, lands in the same row, and shows as
// logged in both.
import { useEffect, useMemo, useState } from 'react';

import { useDialog } from '../Components/Dialog';
import type { MealPlanPayload } from '../Screens/Nutrition/NewMealPlanModal';
import {
    getMealPlansForDate,
    type MealPlan,
} from '../Services/mealPlanService';
import {
    fetchMealLogsForDate,
    MealLogServiceError,
    saveMealLog,
    type MealLog,
} from '../Services/mealLogService';
import { toDateKey } from '../Services/workoutLogService';
import { parseTimeToMinutes } from '../Services/workoutPlanService';
import { useMealPlans } from '../Store/mealPlansSlice';

/** One meal as a day shows it — the plan, with that day's row applied. */
export interface DayMealCard {
    /** Undefined when the plan has been deleted and only the row remains. */
    plan: MealPlan | undefined;
    planId: string;
    name: string;
    mealType: MealPlan['mealType'];
    time: string;
    items: MealPlan['items'];
    isLogged: boolean;
}

export interface UseDayMealsResult {
    /** The plans that recur on the date's weekday, earliest first. */
    dayMeals: MealPlan[];
    /** What to show for the date — see the comment on the memo below. */
    dayCards: DayMealCard[];
    /** True once this date's logs have loaded. */
    hasLogsForDay: boolean;
    /** The date's row for a plan, planned or completed — what the edit
        sheet starts from, so reopening it keeps an earlier correction. */
    rowFor: (planId: string) => MealLog | undefined;
    /** Which plan is mid-log, so only that card shows "Saving…". */
    loggingPlanId: string | null;
    /** Marks a meal eaten, as currently shown. */
    logMeal: (plan: MealPlan) => Promise<void>;
    /** Saves a one-day adjustment, still 'planned'. Throws on failure —
        the caller owns the sheet and decides what failing looks like. */
    saveDayEdit: (plan: MealPlan, payload: MealPlanPayload) => Promise<void>;
}

export function useDayMeals(date: Date): UseDayMealsResult {
    const dialog = useDialog();
    const dateKey = toDateKey(date);

    // One app-wide listener feeds this (App.tsx's useMealPlansSync), so a
    // plan saved here is on screen — and on the Schedule tab — the moment
    // Firestore acknowledges the write.
    const mealPlans = useMealPlans();

    // The plans that recur on the selected date's weekday, earliest first.
    const dayMeals = useMemo(
        () =>
            [...getMealPlansForDate(date, mealPlans)].sort(
                (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
            ),
        [date, mealPlans],
    );

    // What the user has actually eaten on the selected date. Fetched per
    // date rather than subscribed: unlike plans, it changes only when the
    // user logs something.
    const [mealLogs, setMealLogs] = useState<{ dateKey: string; rows: MealLog[] }>({
        dateKey: '',
        rows: [],
    });
    const hasLogsForDay = mealLogs.dateKey === dateKey;
    const [logRefreshKey, setLogRefreshKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        fetchMealLogsForDate(dateKey)
            .then((rows) => {
                if (!cancelled) setMealLogs({ dateKey, rows });
            })
            .catch((error) => {
                if (cancelled) return;
                // The planned meals still render, but silently dropping
                // this made a denied read indistinguishable from a day
                // with nothing logged — and the Log/Edit buttons are
                // driven entirely by what comes back here.
                setMealLogs({ dateKey, rows: [] });
                dialog.show({
                    title: 'Could not load logged meals',
                    message:
                        error instanceof MealLogServiceError
                            ? error.message
                            : 'Something went wrong loading this day.',
                });
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateKey, logRefreshKey]);

    /**
     * This plan's row for the selected day, whatever state it is in.
     *
     * A 'planned' row means the user adjusted what they were going to
     * eat but has not logged it yet; a 'completed' one means they have.
     * Both need to be found, because the card shows the adjusted items
     * either way — the state only decides which buttons appear.
     */
    const rowFor = (planId: string): MealLog | undefined =>
        hasLogsForDay ? mealLogs.rows.find((row) => row.planId === planId) : undefined;

    /**
     * What to show for the selected day.
     *
     * The log rows are the authority: if one exists for a date it holds
     * what was actually eaten (or the adjustment about to be logged), so
     * its values win over the plan's. The plan is the fallback for days
     * with no row yet.
     *
     * Rows whose plan no longer recurs on this weekday — rescheduled,
     * paused, or deleted since — are added back at the end. Otherwise a
     * meal you logged would vanish from its own day the moment you
     * changed the plan behind it.
     */
    const dayCards = useMemo<DayMealCard[]>(() => {
        const rows = hasLogsForDay ? mealLogs.rows : [];
        const byPlanId = new Map(rows.map((row) => [row.planId, row]));

        const fromPlans = dayMeals.map((plan) => {
            const row = byPlanId.get(plan.id);
            return {
                plan,
                planId: plan.id,
                name: row?.planName ?? plan.name,
                mealType: row?.mealType ?? plan.mealType,
                time: row?.time ?? plan.time,
                items: row?.items ?? plan.items,
                isLogged: row?.state === 'completed',
            };
        });

        const shown = new Set(dayMeals.map((plan) => plan.id));
        const orphaned = rows
            .filter((row) => !shown.has(row.planId))
            .map((row) => ({
                // The plan may be gone entirely, in which case the row is
                // all that is left to render from.
                plan: mealPlans.find((plan) => plan.id === row.planId),
                planId: row.planId,
                name: row.planName,
                mealType: row.mealType,
                time: row.time,
                items: row.items,
                isLogged: row.state === 'completed',
            }));

        return [...fromPlans, ...orphaned].sort(
            (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
        );
    }, [dayMeals, mealLogs, hasLogsForDay, mealPlans]);

    const [loggingPlanId, setLoggingPlanId] = useState<string | null>(null);

    /** Merges one saved row into the day's logs, replacing any earlier
     * row for the same plan. */
    const applyLoggedRow = (row: MealLog) =>
        setMealLogs((prev) => {
            const rows = (prev.dateKey === dateKey ? prev.rows : []).filter(
                (existing) => existing.planId !== row.planId,
            );
            return { dateKey, rows: [...rows, row] };
        });

    // Logs whatever the card is currently showing — the plan as it
    // stands, or the adjusted version if the user edited it first.
    const logMeal = async (plan: MealPlan) => {
        const pending = rowFor(plan.id);
        const items = pending?.items ?? plan.items;
        const time = pending?.time ?? plan.time;
        const name = pending?.planName ?? plan.name;
        const mealType = pending?.mealType ?? plan.mealType;

        setLoggingPlanId(plan.id);
        try {
            await saveMealLog({
                planId: plan.id,
                planName: name,
                mealType,
                date: dateKey,
                time,
                items,
                state: 'completed',
            });
            // Applied locally as well as refetched: the write is the
            // authority on what was just saved, so the button flips
            // immediately even if the follow-up read is slow.
            applyLoggedRow({
                id: `${plan.id}-${dateKey}`,
                userId: '',
                planId: plan.id,
                planName: name,
                mealType,
                date: dateKey,
                time,
                items,
                state: 'completed',
                updatedAt: null,
            });
            setLogRefreshKey((key) => key + 1);
        } catch (error) {
            dialog.show({
                title: 'Could not log meal',
                message:
                    error instanceof MealLogServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
        } finally {
            setLoggingPlanId(null);
        }
    };

    // Adjusting what will be eaten on the date, before logging it. Writes
    // that date's row only — never the recurring plan.
    const saveDayEdit = async (plan: MealPlan, payload: MealPlanPayload) => {
        await saveMealLog({
            planId: plan.id,
            planName: payload.name,
            mealType: payload.mealType,
            date: dateKey,
            time: payload.time,
            items: payload.items,
            // Still 'planned': the user changed what they intend to
            // eat, they have not said they ate it. Log Meal is what
            // marks it completed.
            state: 'planned',
        });
        applyLoggedRow({
            id: `${plan.id}-${dateKey}`,
            userId: '',
            planId: plan.id,
            planName: payload.name,
            mealType: payload.mealType,
            date: dateKey,
            time: payload.time,
            items: payload.items,
            state: 'planned',
            updatedAt: null,
        });
        setLogRefreshKey((key) => key + 1);
    };

    return { dayMeals, dayCards, hasLogsForDay, rowFor, loggingPlanId, logMeal, saveDayEdit };
}

export default useDayMeals;
