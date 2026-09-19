// When a scheduled session — a workout or a meal — becomes actionable,
// and which of today's sessions deserves the dashboard's attention.
//
// Pure functions, no React and no storage: both dashboard cards run the
// same rules, and keeping them here means "upcoming" and "due" can never
// mean one thing for workouts and another for meals.
import { parseTimeToMinutes } from './workoutPlanService';

/**
 * 'upcoming' — its time has not come yet. Nothing to log.
 * 'due'      — its time has passed and it has not been logged. This is
 *              the moment the user is asked to act.
 * 'logged'   — done; settled whatever the clock says.
 */
export type SessionPhase = 'upcoming' | 'due' | 'logged';

export interface ScheduledSession {
    /** e.g. "8:00 AM" — the plan's time, as stored. */
    time: string;
    isLogged: boolean;
}

/** Minutes since local midnight. */
export function minutesOfDay(now: Date): number {
    return now.getHours() * 60 + now.getMinutes();
}

/**
 * Where one of TODAY's sessions stands at `now`.
 *
 * Only meaningful for today — a date-less time cannot tell yesterday's
 * 8 AM from tomorrow's. Due from its start minute onward, inclusive:
 * an 8:00 workout is actionable at 8:00, not 8:01.
 */
export function sessionPhase(session: ScheduledSession, now: Date): SessionPhase {
    if (session.isLogged) return 'logged';
    return parseTimeToMinutes(session.time) <= minutesOfDay(now) ? 'due' : 'upcoming';
}

export interface FocusedSession<T extends ScheduledSession> {
    session: T;
    phase: SessionPhase;
}

/**
 * The one session a dashboard card should show, from today's list.
 *
 *  1. The most recent session that is due and not yet logged — the one
 *     the user is "in" right now. Most recent rather than earliest: at
 *     1 PM, lunch is what they are about to deal with, not a breakfast
 *     they skipped at 8.
 *  2. Otherwise the next upcoming one, earliest first.
 *  3. Otherwise the latest logged one, so a finished day still shows
 *     what was done rather than looking empty.
 *
 * Null only when today has nothing scheduled at all.
 */
export function pickFocusSession<T extends ScheduledSession>(
    sessions: T[],
    now: Date,
): FocusedSession<T> | null {
    const byTime = [...sessions].sort(
        (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
    );
    const withPhase = byTime.map((session) => ({ session, phase: sessionPhase(session, now) }));

    const due = withPhase.filter((entry) => entry.phase === 'due');
    if (due.length > 0) return due[due.length - 1];

    const upcoming = withPhase.find((entry) => entry.phase === 'upcoming');
    if (upcoming) return upcoming;

    return withPhase[withPhase.length - 1] ?? null;
}

/**
 * A short status line for a session, shared by both dashboard cards so
 * they phrase time the same way:
 *   upcoming → "Starts in 25 min" / "Starts in 2h 05m"
 *   due      → "Due now" for its first hour, then "Due since 8:00 AM"
 *   logged   → "Logged"
 */
export function describeSession(session: ScheduledSession, phase: SessionPhase, now: Date): string {
    if (phase === 'logged') return 'Logged';

    const delta = parseTimeToMinutes(session.time) - minutesOfDay(now);
    // A session kept alive only by its log row — its plan since deleted —
    // can have no time at all; "Due since " with nothing after it reads
    // as a bug, so it falls back to the plain form.
    if (phase === 'due') {
        return delta > -60 || !session.time ? 'Due now' : `Due since ${session.time}`;
    }

    if (delta < 60) return `Starts in ${delta} min`;
    const hours = Math.floor(delta / 60);
    return `Starts in ${hours}h ${String(delta % 60).padStart(2, '0')}m`;
}

/**
 * How many of today's sessions, other than the focused one, are due and
 * still not logged — so a card can say "+1 earlier not logged" instead
 * of silently hiding a skipped breakfast behind lunch.
 */
export function countOtherDue<T extends ScheduledSession>(
    sessions: T[],
    focused: T | null,
    now: Date,
): number {
    return sessions.filter(
        (session) => session !== focused && sessionPhase(session, now) === 'due',
    ).length;
}
