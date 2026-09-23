// Subscribes a component to last night's sleep, read from Health Connect.
//
// Read on mount and again on foreground. Sleep lands in Health Connect
// whenever the provider syncs — a watch often uploads only after it
// reconnects to the phone in the morning — so the first look of the
// day can come back empty and a later one full. Returning to the app is
// the natural moment to ask again.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { cacheKey, cachePeek, cachedFetch } from '../Services/dataCache';
import {
    readLastNightSleep,
    type SleepResult,
    type SleepSummary,
    type SleepStatus,
} from '../Services/healthConnectSleep';
import { todayDateKey } from '../Services/workoutLogService';

/** Last night's sleep does not change through the day, and the screen
 * reads it again whenever the app returns to the foreground, so a
 * generous window is safe. */
const SLEEP_MAX_AGE_MS = 15 * 60_000;

/** Health Connect is per-device, not per-account, hence no user segment. */
const sleepCacheKey = () => cacheKey('sleep', 'device', todayDateKey());

export interface UseLastNightSleepResult {
    /** Null until loaded, and whenever `status` is not 'ok'. */
    summary: SleepSummary | null;
    status: SleepStatus;
    /** True until the first read lands, so the tile can show a
        placeholder rather than a "no data" that is not yet true. */
    loading: boolean;
    /** Re-reads on demand, e.g. after the user grants permission. */
    refresh: () => void;
}

export function useLastNightSleep(): UseLastNightSleepResult {
    // Seeded from the read cache, so a return to the Home tab paints last
    // night's sleep on the first frame instead of "Checking Health Connect…".
    const [cached] = useState(() => cachePeek<SleepResult>(sleepCacheKey(), SLEEP_MAX_AGE_MS));
    const [summary, setSummary] = useState<SleepSummary | null>(cached?.value.summary ?? null);
    const [status, setStatus] = useState<SleepStatus>(cached?.value.status ?? 'ok');
    const [loading, setLoading] = useState(cached === undefined);
    const mounted = useRef(true);

    // `force` re-reads Health Connect: coming back to the foreground and an
    // explicit retry (after granting permission) both mean "check again".
    const load = useCallback(async (force = false) => {
        const result = await cachedFetch(sleepCacheKey(), readLastNightSleep, {
            force,
            maxAgeMs: SLEEP_MAX_AGE_MS,
        });
        if (!mounted.current) return;
        setSummary(result.summary);
        setStatus(result.status);
        setLoading(false);
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

    return { summary, status, loading, refresh: () => void load(true) };
}

export default useLastNightSleep;
