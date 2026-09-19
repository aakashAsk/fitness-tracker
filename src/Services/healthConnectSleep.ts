// Android Health Connect — last night's sleep.
//
// This app does not measure sleep itself. A phone on a nightstand
// cannot tell sleep from lying still, so the data here was written to
// Health Connect by something that can: a watch or ring (Fitbit, Galaxy
// Watch, Pixel Watch, Oura), or a phone-based sleep app such as Sleep
// as Android. With none of those installed Health Connect holds no
// sleep at all, and 'no-data' is the honest, expected answer — not an
// error.
//
// Android-only, like the step reader. iOS would need HealthKit, which
// this app does not integrate yet.
import {
    getHealthConnectStatus,
    loadModule,
    requestHealthConnectPermission,
    type HealthConnectStatus,
} from './healthConnectSteps';

/**
 * Health Connect's stage codes, per the library's SleepStageType.
 * Copied rather than imported so this file never touches the native
 * module at load time — see loadModule.
 */
const STAGE = {
    UNKNOWN: 0,
    AWAKE: 1,
    SLEEPING: 2,
    OUT_OF_BED: 3,
    LIGHT: 4,
    DEEP: 5,
    REM: 6,
} as const;

/** Stages that count as time asleep. AWAKE, OUT_OF_BED and UNKNOWN do
    not — UNKNOWN because a provider that cannot say whether the user
    was asleep has not told us they were. */
const ASLEEP_STAGES = new Set<number>([STAGE.SLEEPING, STAGE.LIGHT, STAGE.DEEP, STAGE.REM]);

/** Hour of yesterday from which a session counts as "last night". */
const NIGHT_WINDOW_START_HOUR = 18;

const MINUTE_MS = 60_000;

export type SleepStatus = HealthConnectStatus | 'no-data';

export interface SleepStageBreakdown {
    /** Minutes. */
    deep: number;
    rem: number;
    light: number;
    awake: number;
}

export interface SleepSummary {
    /** When the session began — roughly, getting into bed. */
    start: Date;
    /** When it ended — waking up. */
    end: Date;
    /** Minutes actually asleep. With stages this excludes time awake in
        the night; without them it is the whole session. */
    asleepMinutes: number;
    /** Minutes from start to end, awake time included. */
    inBedMinutes: number;
    /**
     * Null when the provider wrote a session with no stages, or only
     * generic "sleeping" — which phone-only apps often do. Only a
     * wearable reliably separates deep, REM and light.
     */
    stages: SleepStageBreakdown | null;
}

export interface SleepResult {
    /** Null whenever `status` is not 'ok'. */
    summary: SleepSummary | null;
    status: SleepStatus;
}

function minutesBetween(start: string | Date, end: string | Date): number {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return Math.max(Math.round(ms / MINUTE_MS), 0);
}

/** 6 PM yesterday until now. Any main sleep that has finished by the
    time the user checks the dashboard ends inside this window. */
function lastNightRange(): { startTime: string; endTime: string } {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(NIGHT_WINDOW_START_HOUR, 0, 0, 0);
    return { startTime: start.toISOString(), endTime: new Date().toISOString() };
}

interface RawSession {
    startTime: string;
    endTime: string;
    stages?: { startTime: string; endTime: string; stage: number }[];
}

function summarise(session: RawSession): SleepSummary {
    const inBedMinutes = minutesBetween(session.startTime, session.endTime);
    const stages = session.stages ?? [];

    const minutesIn = (codes: ReadonlySet<number> | number) =>
        stages
            .filter((s) =>
                typeof codes === 'number' ? s.stage === codes : codes.has(s.stage),
            )
            .reduce((sum, s) => sum + minutesBetween(s.startTime, s.endTime), 0);

    const stagedAsleep = minutesIn(ASLEEP_STAGES);
    const deep = minutesIn(STAGE.DEEP);
    const rem = minutesIn(STAGE.REM);
    const light = minutesIn(STAGE.LIGHT);

    return {
        start: new Date(session.startTime),
        end: new Date(session.endTime),
        // Stages that add up to nothing asleep — all UNKNOWN, say — say
        // nothing useful, so the session length is the better answer.
        asleepMinutes: stagedAsleep > 0 ? stagedAsleep : inBedMinutes,
        inBedMinutes,
        // A breakdown is only worth showing if it actually separates
        // stages; a single generic "sleeping" block is not one.
        stages:
            deep + rem + light > 0
                ? { deep, rem, light, awake: minutesIn(STAGE.AWAKE) }
                : null,
    };
}

/**
 * Last night's main sleep from Health Connect.
 *
 * "Main sleep" is the longest session ending since 6 PM yesterday.
 * Longest rather than summed, because two providers can record the
 * same night — a watch and a sleep app both writing — and adding their
 * sessions would report a sixteen-hour night. Picking one also keeps an
 * afternoon nap from being counted as the night.
 *
 * Never throws — every failure is a `status` the caller can act on.
 */
export async function readLastNightSleep(): Promise<SleepResult> {
    const module = loadModule();
    if (!module) return { summary: null, status: 'unsupported' };

    const availability = await getHealthConnectStatus();
    if (availability !== 'ok') return { summary: null, status: availability };

    if (!(await requestHealthConnectPermission('SleepSession'))) {
        return { summary: null, status: 'permission-denied' };
    }

    try {
        const { records } = await module.readRecords('SleepSession', {
            timeRangeFilter: { operator: 'between', ...lastNightRange() },
        });

        const main = records.reduce<RawSession | null>(
            (longest, record) =>
                !longest ||
                minutesBetween(record.startTime, record.endTime) >
                    minutesBetween(longest.startTime, longest.endTime)
                    ? record
                    : longest,
            null,
        );

        if (!main) return { summary: null, status: 'no-data' };
        return { summary: summarise(main), status: 'ok' };
    } catch {
        return { summary: null, status: 'error' };
    }
}

/** "7h 32m", or "45m" under an hour. */
export function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** "11:04 PM" — the clock format the rest of the app uses. */
export function formatClock(date: Date): string {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
}
