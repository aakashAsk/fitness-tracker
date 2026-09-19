// The current time, re-rendering the caller once per minute.
//
// Aligned to the minute boundary rather than a bare 60s interval: a
// session at 8:00 should become actionable at 8:00:00, not at whatever
// second past the minute the screen happened to mount. Foregrounding
// re-reads immediately, since timers do not run while backgrounded and
// the app may come back hours — or a day — later.
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

const MINUTE_MS = 60_000;

export function useNow(): Date {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;

        const schedule = () => {
            const current = new Date();
            setNow(current);
            // Time left until the next whole minute, plus a small margin so
            // the tick lands just after the boundary, never just before it.
            const untilNextMinute =
                MINUTE_MS - (current.getSeconds() * 1000 + current.getMilliseconds()) + 50;
            timer = setTimeout(schedule, untilNextMinute);
        };

        schedule();

        const appStateSub = AppState.addEventListener('change', (state) => {
            if (state !== 'active') return;
            clearTimeout(timer);
            schedule();
        });

        return () => {
            clearTimeout(timer);
            appStateSub.remove();
        };
    }, []);

    return now;
}

/**
 * The live clock plus a `today` Date that only changes at midnight.
 *
 * Day-scoped hooks (useDayWorkoutEvents, useDayMeals) memoise on their
 * date's identity, so handing them `now` directly would rebuild the
 * day every minute. `today` is a new object exactly once per day, which
 * is also what rolls the dashboard over to the new day's sessions.
 */
export function useToday(): { now: Date; today: Date } {
    const now = useNow();
    const dayKey = now.toDateString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const today = useMemo(() => new Date(now), [dayKey]);
    return { now, today };
}

export default useNow;
