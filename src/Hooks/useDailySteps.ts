// Subscribes a component to today's step count.
//
// Beyond wrapping the service's subscription in state, this handles the
// one thing a subscription alone cannot: pedometer updates stop while
// the app is backgrounded, so the count on screen is stale the moment
// the user comes back. Re-reading on foreground closes that gap — on
// iOS it recovers every step taken while away, on Android it at least
// picks up whatever the ledger holds.
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
    EMPTY_STEP_READING,
    getDailySteps,
    stepDateKey,
    subscribeToDailySteps,
    type StepReading,
} from '../Services/stepService';

export interface UseDailyStepsResult extends StepReading {
    /** True until the first reading lands, so the card can show a
        placeholder instead of a misleading zero. */
    loading: boolean;
}

/**
 * The last reading this session took, and the day it was for. The
 * dashboard remounts on every Home visit; without this each visit starts
 * from "no reading yet" and shows a placeholder until the pedometer
 * answers. Seeding from it paints the last-known count straight away —
 * the subscription below still runs and replaces it with the live one.
 * Keyed to the day so a count from yesterday is never shown as today's.
 */
let lastReading: { dateKey: string; reading: StepReading } | null = null;

function recentReading(): StepReading | null {
    return lastReading && lastReading.dateKey === stepDateKey() ? lastReading.reading : null;
}

export function useDailySteps(): UseDailyStepsResult {
    const [seed] = useState(recentReading);
    const [reading, setReading] = useState<StepReading>(seed ?? EMPTY_STEP_READING);
    const [loading, setLoading] = useState(seed === null);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;

        const apply = (next: StepReading) => {
            // Remembered even if this component has gone: the reading is
            // about the device, not about who happened to be listening.
            lastReading = { dateKey: stepDateKey(), reading: next };
            if (!mounted.current) return;
            setReading(next);
            setLoading(false);
        };

        const unsubscribe = subscribeToDailySteps(apply);

        const appStateSub = AppState.addEventListener('change', (state) => {
            if (state === 'active') void getDailySteps().then(apply);
        });

        return () => {
            mounted.current = false;
            unsubscribe();
            appStateSub.remove();
        };
    }, []);

    return { ...reading, loading };
}

export default useDailySteps;
