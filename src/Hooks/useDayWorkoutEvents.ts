// The workouts on one date, as both the Workout tab and the dashboard
// see them: the recurring plan rules for that weekday, with that date's
// own occurrences layered on top.
//
// Lifted out of WorkoutSession unchanged so the dashboard's "Today's
// Workout" card cannot disagree with the Workout tab about what is on
// today — a one-day edit, a rename, or a plan since rescheduled all
// resolve the same way in both, because it is the same code.
import { useEffect, useMemo, useState } from 'react';

import {
    applyOccurrencesToEvents,
    getEventsForDate,
    type CalendarEvent,
} from '../Services/calendarEventService';
import { fetchOccurrencesForDate, toDateKey, type WorkoutLog } from '../Services/workoutLogService';
import type { WorkoutPlan } from '../Services/workoutPlanService';
import { useWorkoutPlans } from '../Store/workoutPlansSlice';

export interface UseDayWorkoutEventsResult {
    /** Every plan the user owns, live from the store. */
    workoutPlans: WorkoutPlan[];
    /** The date's workouts, overrides applied. */
    dayEvents: CalendarEvent[];
    /** True once this date's occurrences have loaded — false while a
        previous date's are still the ones in hand. */
    hasOccurrencesForDay: boolean;
    /** Plan ids with a completed session on this date. */
    completedPlanIds: ReadonlySet<string>;
    /** Bumped by `refresh`; for anything else that should re-read after
        a write to this date. */
    refreshKey: number;
    /** Re-reads the date's occurrences after a write. */
    refresh: () => void;
}

export function useDayWorkoutEvents(date: Date): UseDayWorkoutEventsResult {
    // Live-synced plans (App.tsx's useWorkoutPlansSync() keeps this fed
    // from Firestore) → whichever of them are scheduled on the date's
    // weekday, for the signed-in user. Same day-matching logic the
    // Schedule tab uses.
    const workoutPlans = useWorkoutPlans();
    const dateKey = toDateKey(date);

    // This date's materialized occurrences (see workoutLogService):
    // rows that either override the plan's exercise list for this day
    // alone, or record a session that was actually performed.
    //
    // Bumping `refreshKey` re-reads them after a write — unlike plans,
    // these are not kept live in Redux by App.tsx.
    // Results are stored together with the date they describe, rather
    // than alongside a separate isLoading flag. A flag is set inside an
    // effect, which runs only AFTER the first commit for the new date —
    // leaving one rendered frame where the flag still says "loaded" but
    // the data is the previous day's. Comparing the date instead makes
    // "is this day's data here yet" true only when it genuinely is.
    const [occurrences, setOccurrences] = useState<{ dateKey: string; rows: WorkoutLog[] }>({
        dateKey: '',
        rows: [],
    });
    const [refreshKey, setRefreshKey] = useState(0);
    const hasOccurrencesForDay = occurrences.dateKey === dateKey;

    useEffect(() => {
        let cancelled = false;
        fetchOccurrencesForDate(dateKey)
            .then((rows) => {
                if (!cancelled) setOccurrences({ dateKey, rows });
            })
            .catch(() => {
                // Non-fatal: the day still renders from the plan rules
                // alone, just without this date's overrides. It is still
                // marked as loaded, or the card would stay a skeleton
                // forever whenever this read fails.
                if (!cancelled) setOccurrences({ dateKey, rows: [] });
            });
        return () => {
            cancelled = true;
        };
    }, [dateKey, refreshKey]);

    // The recurring rules for this weekday, with this date's own
    // overrides layered on top — and any occurrence whose plan no
    // longer schedules this date unioned back in, so an edited or
    // logged day cannot disappear when its plan is later rescheduled,
    // paused or deleted.
    const dayEvents = useMemo(
        () =>
            applyOccurrencesToEvents(
                getEventsForDate(date, workoutPlans),
                // Never layer another day's rows over this day.
                hasOccurrencesForDay ? occurrences.rows : [],
                workoutPlans,
            ),
        [date, workoutPlans, occurrences, hasOccurrencesForDay],
    );

    // Completed rows only — a 'planned' row is a one-day edit, not a
    // session that happened. Same distinction the Workout tab's Logged
    // badge draws.
    const completedPlanIds = useMemo(
        () =>
            new Set(
                (hasOccurrencesForDay ? occurrences.rows : [])
                    .filter((row) => row.state === 'completed')
                    .map((row) => row.planId),
            ),
        [occurrences, hasOccurrencesForDay],
    );

    return {
        workoutPlans,
        dayEvents,
        hasOccurrencesForDay,
        completedPlanIds,
        refreshKey,
        refresh: () => setRefreshKey((key) => key + 1),
    };
}

export default useDayWorkoutEvents;
