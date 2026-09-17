// Subscribes a component to today's water intake, read from Firestore.
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
    fetchHydrationLog,
    totalMl,
} from '../Services/hydrationLogService';
import { todayDateKey } from '../Services/workoutLogService';

export interface UseDailyHydrationResult {
    /** Millilitres drunk today. 0 when the day has no document yet. */
    ml: number;
    /** The daily target in millilitres, so callers need not import it. */
    goalMl: number;
    /** 0–1, clamped — a day over the goal still fills the ring exactly once. */
    progress: number;
    /** Rounded percentage of the goal, uncapped so overshoot stays visible. */
    goalPercent: number;
    /** True until the first read lands, so the card can show a placeholder
        rather than a zero that looks like a real reading. */
    loading: boolean;
    /** Set when the read failed; the value then stays at 0. */
    error: string | null;
    /** Re-reads the day on demand, e.g. after logging a drink. */
    refresh: () => void;
}

export function useDailyHydration(): UseDailyHydrationResult {
    const [ml, setMl] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        try {
            const log = await fetchHydrationLog(todayDateKey());
            if (!mounted.current) return;
            // No document for the day is not a failure — it is a day with
            // nothing drunk yet, which reads as 0.
            setMl(log ? totalMl(log.entries) : 0);
            setError(null);
        } catch (err) {
            if (!mounted.current) return;
            setMl(0);
            setError(err instanceof Error ? err.message : 'Failed to load water intake.');
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        void load();

        const appStateSub = AppState.addEventListener('change', (state) => {
            if (state === 'active') void load();
        });

        return () => {
            mounted.current = false;
            appStateSub.remove();
        };
    }, [load]);

    const progress = Math.min(ml / DAILY_ML_GOAL, 1);

    return {
        ml,
        goalMl: DAILY_ML_GOAL,
        progress,
        goalPercent: Math.round((ml / DAILY_ML_GOAL) * 100),
        loading,
        error,
        refresh: () => void load(),
    };
}

export default useDailyHydration;
