// Daily step count, assembled from the two sources that each solve
// half the problem.
//
// Neither platform hands over "today's steps, live" in one call:
//
//   Health Connect (Android) knows the true daily total — steps taken
//   while the app was closed, merged across every app that records
//   them — but it is a datastore you query, with no push and a write
//   latency of seconds to minutes. Ask it twice in a row while walking
//   and you may get the same number.
//
//   The pedometer (`TYPE_STEP_COUNTER` via expo-sensors) fires the
//   instant a step is taken, but expo hands JS only the count since
//   *this subscription* started, so it has no idea what happened
//   before the app opened.
//
// So: Health Connect supplies the baseline, the pedometer supplies the
// movement since that baseline was taken, and the card shows the sum.
// The baseline is re-read periodically; when it comes back it already
// contains the steps the pedometer was counting, so the live offset
// resets to zero at the same moment. That hand-off is the one place
// this file can double count, and it is why the reset and the re-read
// happen together rather than on separate timers.
//
// iOS needs none of this. Core Motion answers the daily question
// directly through `getStepCountAsync`, so there the pedometer is used
// only as a signal to re-query.
//
// When Health Connect is missing or refused, Android falls back to a
// device-local ledger in AsyncStorage: pedometer deltas accumulated
// across the day. That undercounts — steps taken while the app was
// closed are genuinely unrecoverable this way — and it is reported as
// `source: 'session'` so the UI can be honest about it.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';

import {
    readTodaySteps,
    type HealthConnectStatus,
} from './healthConnectSteps';

const LEDGER_KEY = 'pulsefit.steps.ledger';

/** Daily target, in steps — the usual 10k. */
export const DAILY_STEP_GOAL = 10000;

/**
 * How often the Health Connect baseline is re-read while the card is
 * on screen.
 *
 * Health Connect's providers batch their writes, so polling faster
 * than this mostly returns an unchanged number at the cost of a round
 * trip — the pedometer is already covering the gap live.
 */
const BASELINE_RESYNC_MS = 90_000;

/** Rough metres per step, used for the distance estimate. */
const METRES_PER_STEP = 0.762;

/** Rough kcal burned per step for an average adult. */
const KCAL_PER_STEP = 0.04;

/**
 * Daily target for calories burned through movement, in kcal.
 *
 * Derived from DAILY_STEP_GOAL rather than picked separately, so the
 * two rings on the dashboard cannot disagree: hitting the step goal is
 * exactly what fills this one.
 */
export const DAILY_BURN_GOAL = Math.round(DAILY_STEP_GOAL * KCAL_PER_STEP);

/** Where a reading's number actually came from. */
export type StepSource =
    /** A true daily total — Health Connect, or iOS Core Motion —
        optionally with live pedometer steps added on top. */
    | 'device'
    /** Our own tally since the app was opened. An undercount. */
    | 'session'
    /** No pedometer and no Health Connect, or both refused. */
    | 'unavailable';

/**
 * Why there is no reading at all.
 *
 * "No sensor" covers several unrelated situations that need different
 * things from the user — install an app, grant a permission, or use a
 * real phone — so they are kept apart rather than collapsed into one
 * dead end.
 */
export type StepUnavailableReason =
    /** Web, or another platform with no step API at all. */
    | 'platform'
    /** `isAvailableAsync` said no: an emulator, or a device with no
        step-counter hardware. Nothing the user can fix in-app. */
    | 'no-hardware'
    /** Hardware exists, but motion permission was refused. */
    | 'permission';

export interface StepReading {
    /** Steps today, local to the device. */
    steps: number;
    /** Estimated metres walked. */
    distanceMetres: number;
    /** Estimated kcal burned walking. */
    caloriesBurned: number;
    /** 0–1, clamped — `steps / DAILY_STEP_GOAL`. */
    goalProgress: number;
    source: StepSource;
    /** Why Health Connect is not the source, when it is not. Lets the
        UI offer "open settings" only when that would actually help. */
    healthConnectStatus: HealthConnectStatus | null;
    /** Set only when `source` is `'unavailable'`. */
    unavailableReason: StepUnavailableReason | null;
}

export class StepServiceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StepServiceError';
    }
}

/** "YYYY-MM-DD" in the device's own timezone — the same day key the
    hydration and workout logs use. */
export function stepDateKey(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function startOfDay(date: Date = new Date()): Date {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
}

/** Wraps a raw step count in the derived numbers the dashboard shows. */
export function toStepReading(
    steps: number,
    source: StepSource,
    healthConnectStatus: HealthConnectStatus | null = null,
    unavailableReason: StepUnavailableReason | null = null,
): StepReading {
    const safe = Math.max(Math.round(steps) || 0, 0);
    return {
        steps: safe,
        distanceMetres: Math.round(safe * METRES_PER_STEP),
        caloriesBurned: Math.round(safe * KCAL_PER_STEP),
        goalProgress: Math.min(safe / DAILY_STEP_GOAL, 1),
        source,
        healthConnectStatus,
        unavailableReason: source === 'unavailable' ? unavailableReason : null,
    };
}

export const EMPTY_STEP_READING: StepReading = toStepReading(0, 'unavailable');

/** An `'unavailable'` reading that says why. */
function unavailable(
    reason: StepUnavailableReason,
    healthConnectStatus: HealthConnectStatus | null = null,
): StepReading {
    return toStepReading(0, 'unavailable', healthConnectStatus, reason);
}

// ── Availability and permission ──────────────────────────────────────

/** False on devices with no step hardware, and on web. */
export async function isStepTrackingAvailable(): Promise<boolean> {
    try {
        return await Pedometer.isAvailableAsync();
    } catch {
        return false;
    }
}

/**
 * Asks for motion permission, returning whether it was granted.
 *
 * Non-throwing: a refused permission is an ordinary outcome here, not
 * an error — the caller renders the "—" state either way.
 */
export async function requestStepPermission(): Promise<boolean> {
    try {
        const existing = await Pedometer.getPermissionsAsync();
        if (existing.granted) return true;
        if (!existing.canAskAgain) return false;

        const requested = await Pedometer.requestPermissionsAsync();
        return requested.granted;
    } catch {
        return false;
    }
}

// ── The Android fallback ledger ──────────────────────────────────────
//
// Only used when Health Connect cannot answer. One entry, not a
// history: `{ date, steps }`. A reading for a date other than today is
// thrown away rather than migrated, because a stale total added to
// today's would silently inflate it.

interface StepLedger {
    date: string;
    steps: number;
}

async function readLedger(): Promise<StepLedger> {
    const today = stepDateKey();
    try {
        const raw = await AsyncStorage.getItem(LEDGER_KEY);
        if (!raw) return { date: today, steps: 0 };

        const parsed = JSON.parse(raw) as Partial<StepLedger>;
        if (parsed?.date !== today) return { date: today, steps: 0 };

        return { date: today, steps: Math.max(Number(parsed.steps) || 0, 0) };
    } catch {
        return { date: today, steps: 0 };
    }
}

async function writeLedger(ledger: StepLedger): Promise<void> {
    try {
        await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
    } catch {
        // Ignored on purpose: losing the cache costs this session's
        // steps, which is not worth failing a dashboard render over.
    }
}

/** Drops the ledger — used on sign-out so the next account does not
    inherit these steps. */
export async function clearStepLedger(): Promise<void> {
    try {
        await AsyncStorage.removeItem(LEDGER_KEY);
    } catch {
        // See writeLedger.
    }
}

// ── Reading today's total ────────────────────────────────────────────

/**
 * Today's steps, from the best source the platform offers.
 *
 * This is the *baseline* read — it does not include live pedometer
 * steps taken since the last one. `subscribeToDailySteps` layers those
 * on top.
 *
 * Never throws — an unreadable device yields an `'unavailable'`
 * reading, which the dashboard renders as a dash.
 */
export async function getDailySteps(): Promise<StepReading> {
    if (Platform.OS === 'web') return unavailable('platform');

    if (Platform.OS === 'ios') {
        if (!(await isStepTrackingAvailable())) return unavailable('no-hardware');
        if (!(await requestStepPermission())) return unavailable('permission');

        try {
            const result = await Pedometer.getStepCountAsync(startOfDay(), new Date());
            return toStepReading(result?.steps ?? 0, 'device');
        } catch {
            return unavailable('no-hardware');
        }
    }

    // Android. Health Connect first — it is the only source that knows
    // about steps taken while the app was closed.
    const healthConnect = await readTodaySteps();
    if (healthConnect.status === 'ok' && healthConnect.steps !== null) {
        return toStepReading(healthConnect.steps, 'device', 'ok');
    }

    // Health Connect could not answer. Fall back to whatever the
    // pedometer has managed to accumulate itself.
    if (!(await isStepTrackingAvailable())) {
        return unavailable('no-hardware', healthConnect.status);
    }
    if (!(await requestStepPermission())) {
        return unavailable('permission', healthConnect.status);
    }

    const ledger = await readLedger();
    return toStepReading(ledger.steps, 'session', healthConnect.status);
}

// ── Live updates ─────────────────────────────────────────────────────

/**
 * Calls `onReading` with today's steps, then again on every step and
 * whenever the baseline is refreshed. Returns an unsubscribe function;
 * call it on unmount.
 */
export function subscribeToDailySteps(
    onReading: (reading: StepReading) => void,
): () => void {
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    let resyncTimer: ReturnType<typeof setInterval> | null = null;

    /** The last baseline, and which source produced it. */
    let baseline = EMPTY_STEP_READING;
    /** Live pedometer steps since that baseline was taken. Android
        only — on iOS a tick re-queries Core Motion instead. */
    let liveSinceBaseline = 0;
    /** The previous raw value from this watch subscription, so ticks
        can be diffed into a delta. */
    let lastWatchedSteps = 0;

    const emit = () => {
        if (cancelled) return;
        if (baseline.source === 'unavailable') {
            onReading(baseline);
            return;
        }
        onReading(
            toStepReading(
                baseline.steps + liveSinceBaseline,
                baseline.source,
                baseline.healthConnectStatus,
            ),
        );
    };

    /**
     * Re-reads the baseline and clears the live offset together.
     *
     * These two must happen as one step: the returned total already
     * includes the steps `liveSinceBaseline` was tracking, so leaving
     * the offset standing would count them twice.
     */
    const resyncBaseline = async () => {
        const next = await getDailySteps();
        if (cancelled) return;
        baseline = next;
        liveSinceBaseline = 0;
        emit();
    };

    void (async () => {
        await resyncBaseline();
        if (cancelled || baseline.source === 'unavailable') return;

        // On iOS the history is authoritative and cheap to re-query, so
        // a tick just triggers a re-read. On Android the baseline is a
        // network-ish call into Health Connect, so ticks are applied
        // locally and the baseline refreshes on a slower timer.
        try {
            subscription = Pedometer.watchStepCount((result) => {
                if (cancelled) return;

                if (Platform.OS === 'ios') {
                    void resyncBaseline();
                    return;
                }

                const total = Math.max(result?.steps ?? 0, 0);
                // A shrinking total means the sensor restarted (a reboot
                // zeroes TYPE_STEP_COUNTER), so treat it as a fresh run.
                const delta = total >= lastWatchedSteps ? total - lastWatchedSteps : total;
                lastWatchedSteps = total;
                if (delta <= 0) return;

                if (baseline.source === 'session') {
                    // No Health Connect — the ledger *is* the total, so
                    // the delta has to be persisted rather than held as
                    // an offset that dies with this subscription.
                    void (async () => {
                        const ledger = await readLedger();
                        const next = { date: ledger.date, steps: ledger.steps + delta };
                        await writeLedger(next);
                        if (cancelled) return;
                        baseline = toStepReading(
                            next.steps,
                            'session',
                            baseline.healthConnectStatus,
                        );
                        emit();
                    })();
                    return;
                }

                liveSinceBaseline += delta;
                emit();
            });
        } catch {
            // Watching failed after availability said otherwise; the
            // baseline already went out, so leave it standing.
        }

        if (Platform.OS === 'android') {
            resyncTimer = setInterval(() => void resyncBaseline(), BASELINE_RESYNC_MS);
        }
    })();

    return () => {
        cancelled = true;
        subscription?.remove();
        subscription = null;
        if (resyncTimer) clearInterval(resyncTimer);
        resyncTimer = null;
    };
}
