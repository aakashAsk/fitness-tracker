// Subscribes a component to today's telemetry row — water, and the body
// weight the dashboard's weight tile shows.
//
// Replaces useDailyHydration: water now lives in the `telemetry`
// collection alongside the day's other metrics, so one read serves the
// whole dashboard instead of one per metric.
//
// The Dashboard mounts fresh whenever the Home tab is opened (App.tsx
// swaps screens with a switch, so the tab is unmounted while away),
// which covers the common "logged water on the Nutrition tab, went
// back home" case. Re-reading on foreground closes the other gap: the
// app sitting on the Dashboard overnight, where "today" itself has
// changed underneath it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
    DAILY_ML_GOAL,
    fetchTelemetry,
    peekTelemetry,
    totalMl,
    type TelemetryDay,
} from '../Services/telemetryService';
import { todayDateKey } from '../Services/workoutLogService';

export interface UseDailyTelemetryResult {
    /** Millilitres drunk today. 0 when the day has no document yet. */
    ml: number;
    /** The daily target in millilitres, so callers need not import it. */
    goalMl: number;
    /** 0–1, clamped — a day over the goal still fills the ring exactly once. */
    progress: number;
    /** Rounded percentage of the goal, uncapped so overshoot stays visible. */
    goalPercent: number;
    /** Today's weigh-in, or null when there has not been one. */
    weightKg: number | null;
    /** The whole row, for anything the fields above do not cover. */
    day: TelemetryDay | null;
    /** True until the first read lands, so a card can show a placeholder
        rather than a zero that looks like a real reading. */
    loading: boolean;
    /** Set when the read failed; the values then stay empty. */
    error: string | null;
    /** Re-reads the day on demand, e.g. after logging a drink. */
    refresh: () => void;
}

export function useDailyTelemetry(): UseDailyTelemetryResult {
    // Seeded from the read cache when today was read recently, so a return
    // to the Home tab paints the last-known water and weight on the first
    // frame instead of a loading state. The mount read below is then
    // served from the same cache — no Firestore round trip.
    const [cached] = useState(() => peekTelemetry(todayDateKey()));
    const [day, setDay] = useState<TelemetryDay | null>(cached?.day ?? null);
    const [loading, setLoading] = useState(cached === undefined);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);

    // `force` bypasses the cache: coming back to the foreground and an
    // explicit refresh both mean "check again", whereas a plain mount
    // means "show me what you have".
    const load = useCallback(async (force = false) => {
        try {
            const row = await fetchTelemetry(todayDateKey(), { force });
            if (!mounted.current) return;
            // No document for the day is not a failure — it is a day with
            // nothing recorded yet, which reads as empty.
            setDay(row);
            setError(null);
        } catch (err) {
            if (!mounted.current) return;
            setDay(null);
            setError(err instanceof Error ? err.message : 'Failed to load your daily telemetry.');
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        void load();

        const appStateSub = AppState.addEventListener('change', (state) => {
            if (state === 'active') void load(true);
        });

        return () => {
            mounted.current = false;
            appStateSub.remove();
        };
    }, [load]);

    const ml = day ? totalMl(day.water) : 0;

    return {
        ml,
        goalMl: DAILY_ML_GOAL,
        progress: Math.min(ml / DAILY_ML_GOAL, 1),
        goalPercent: Math.round((ml / DAILY_ML_GOAL) * 100),
        weightKg: day?.weightKg ?? null,
        day,
        loading,
        error,
        refresh: () => void load(true),
    };
}

export default useDailyTelemetry;
