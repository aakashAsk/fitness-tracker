// Subscribes a component to last night's sleep, read from Health Connect.
//
// Read on mount and again on foreground. Sleep lands in Health Connect
// whenever the provider syncs — a watch often uploads only after it
// reconnects to the phone in the morning — so the first look of the
// day can come back empty and a later one full. Returning to the app is
// the natural moment to ask again.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
    readLastNightSleep,
    type SleepSummary,
    type SleepStatus,
} from '../Services/healthConnectSleep';

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
    const [summary, setSummary] = useState<SleepSummary | null>(null);
    const [status, setStatus] = useState<SleepStatus>('ok');
    const [loading, setLoading] = useState(true);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        const result = await readLastNightSleep();
        if (!mounted.current) return;
        setSummary(result.summary);
        setStatus(result.status);
        setLoading(false);
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

    return { summary, status, loading, refresh: () => void load() };
}

export default useLastNightSleep;
