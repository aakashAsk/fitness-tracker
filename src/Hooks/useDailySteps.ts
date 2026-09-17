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
    subscribeToDailySteps,
    type StepReading,
} from '../Services/stepService';

export interface UseDailyStepsResult extends StepReading {
    /** True until the first reading lands, so the card can show a
        placeholder instead of a misleading zero. */
    loading: boolean;
}

export function useDailySteps(): UseDailyStepsResult {
    const [reading, setReading] = useState<StepReading>(EMPTY_STEP_READING);
    const [loading, setLoading] = useState(true);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;

        const apply = (next: StepReading) => {
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
