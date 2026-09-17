// The dashboard's "Good morning, Alex" line, kept honest about the
// actual time of day.
//
// The clock is polled rather than read once at mount: the app is often
// left open, and a session that starts at 11:55 should not still say
// "Good morning" at half past noon. State is only set when the rendered
// strings actually change, so the poll costs a comparison a minute
// rather than a dashboard re-render a minute. Foregrounding re-checks
// immediately, which is what catches the app resumed the next day.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

const TICK_MS = 60_000;

const WEEKDAYS = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
];

const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

/** "Good morning" / "Good afternoon" / "Good evening" for the hour. */
export function greetingForHour(hour: number): string {
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

/** "Wednesday, 18 Oct" — the format the dashboard already showed. */
export function formatDateLabel(date: Date): string {
    return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export interface Greeting {
    /** e.g. "Good morning" — no name, so the caller decides the punctuation. */
    greeting: string;
    /** e.g. "Wednesday, 18 Oct". */
    dateLabel: string;
}

function currentGreeting(): Greeting {
    const now = new Date();
    return {
        greeting: greetingForHour(now.getHours()),
        dateLabel: formatDateLabel(now),
    };
}

export function useGreeting(): Greeting {
    const [value, setValue] = useState<Greeting>(currentGreeting);

    useEffect(() => {
        const sync = () => {
            const next = currentGreeting();
            setValue((prev) =>
                prev.greeting === next.greeting && prev.dateLabel === next.dateLabel
                    ? prev // Same strings — keep the old object so React bails out.
                    : next,
            );
        };

        const timer = setInterval(sync, TICK_MS);
        const appStateSub = AppState.addEventListener('change', (state) => {
            if (state === 'active') sync();
        });

        return () => {
            clearInterval(timer);
            appStateSub.remove();
        };
    }, []);

    return value;
}

export default useGreeting;
