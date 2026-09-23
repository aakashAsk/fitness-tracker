// The telemetry document's shape and every rule that can be decided
// without touching Firestore — kept separate from telemetryService so it
// can be unit-tested, the same split as nutritionTotals/mealPlanService.
//
// One document per (user, date) holds everything the dashboard shows for
// that day: water drunk, steps, calories burned, sleep and body weight.
// A day is a row, not a stream of events, because every consumer asks
// "what did this day look like" — and because a single merge-write per
// metric keeps a day's cost to one document no matter how often the
// pedometer ticks.

/** One glass, in millilitres. */
export const ML_PER_GLASS = 250;

/** The daily target, in glasses — 2 litres. */
export const DAILY_GLASS_GOAL = 8;

/** The daily target, in millilitres. */
export const DAILY_ML_GOAL = DAILY_GLASS_GOAL * ML_PER_GLASS;

/** A single drink. */
export interface WaterEntry {
    /** Millilitres. */
    ml: number;
    /** e.g. "8:30 AM" — when it was drunk, local to the device. */
    time: string;
}

/** Minutes per stage, when the sleep source separates them. */
export interface SleepStages {
    deep: number;
    rem: number;
    light: number;
    awake: number;
}

/**
 * Last night's sleep as stored.
 *
 * Times are ISO strings rather than Date objects: this is what goes into
 * the document, and a stored day has to survive being read back on
 * another device in another timezone without a class to rehydrate.
 */
export interface SleepSnapshot {
    asleepMinutes: number;
    inBedMinutes: number;
    /** ISO instants, or null when the source gave no session bounds. */
    start: string | null;
    end: string | null;
    stages: SleepStages | null;
}

/** One day of dashboard metrics for one user. */
export interface TelemetryDay {
    id: string;
    userId: string;
    /** "YYYY-MM-DD", local to the device. */
    date: string;
    /**
     * Every drink of the day, oldest first. Individual entries rather
     * than a running total: a total throws away *when* the user drank,
     * and it is what lets a mistaken entry be removed without guessing
     * how big it was.
     */
    water: WaterEntry[];
    /** Null where nothing has reported the metric for this day yet —
        which is different from a measured zero, and is why every one of
        these is nullable rather than defaulted. */
    steps: number | null;
    caloriesBurned: number | null;
    weightKg: number | null;
    sleep: SleepSnapshot | null;
    updatedAt: Date | null;
}

/** `${userId}_${date}` — same deterministic id the log collections use,
 * minus the plan segment, since a day is not tied to a plan. */
export function telemetryDocId(userId: string, date: string): string {
    return `${userId}_${date}`;
}

/** "8:30 AM" — the same clock format meal and workout plans use. */
export function formatEntryTime(date: Date): string {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${minutes} ${period}`;
}

/** Total millilitres across a day's entries. */
export function totalMl(entries: WaterEntry[]): number {
    return entries.reduce((sum, entry) => sum + entry.ml, 0);
}

/** How many whole glasses a day's entries add up to, capped at the goal
 * so the tracker's eight tiles cannot overflow. */
export function glassesFrom(entries: WaterEntry[]): number {
    return Math.min(Math.floor(totalMl(entries) / ML_PER_GLASS), DAILY_GLASS_GOAL);
}

/** Drops anything that records nothing and rounds what is left, so a
 * stray negative or fractional millilitre can never reach the database. */
export function sanitiseWater(entries: WaterEntry[]): WaterEntry[] {
    return entries
        .filter((entry) => entry.ml > 0)
        .map((entry) => ({ ml: Math.round(entry.ml), time: entry.time }));
}

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function toWaterEntry(raw: unknown): WaterEntry {
    const entry = (raw ?? {}) as Record<string, unknown>;
    return {
        ml: Math.max(Number(entry.ml) || 0, 0),
        time: (entry.time as string) ?? '',
    };
}

function toSleep(raw: unknown): SleepSnapshot | null {
    if (!raw || typeof raw !== 'object') return null;
    const sleep = raw as Record<string, unknown>;
    const stages = sleep.stages as Record<string, unknown> | null | undefined;
    return {
        asleepMinutes: Math.max(Number(sleep.asleepMinutes) || 0, 0),
        inBedMinutes: Math.max(Number(sleep.inBedMinutes) || 0, 0),
        start: (sleep.start as string) ?? null,
        end: (sleep.end as string) ?? null,
        stages: stages
            ? {
                  deep: Number(stages.deep) || 0,
                  rem: Number(stages.rem) || 0,
                  light: Number(stages.light) || 0,
                  awake: Number(stages.awake) || 0,
              }
            : null,
    };
}

/**
 * Maps a stored document to a TelemetryDay.
 *
 * `updatedAt` is duck-typed on `toDate` rather than checked against
 * Firestore's Timestamp class, so this module stays free of the SDK and
 * remains testable — and so a server timestamp that has not resolved yet
 * reads as null instead of throwing.
 */
export function toTelemetryDay(id: string, data: Record<string, unknown>): TelemetryDay {
    const updatedAt = data.updatedAt as { toDate?: () => Date } | null | undefined;
    return {
        id,
        userId: (data.userId as string) ?? '',
        date: (data.date as string) ?? '',
        water: ((data.water as unknown[]) ?? [])
            .map(toWaterEntry)
            // A zero-ml entry records nothing and would show as a blank row.
            .filter((entry) => entry.ml > 0),
        steps: toNumberOrNull(data.steps),
        caloriesBurned: toNumberOrNull(data.caloriesBurned),
        weightKg: toNumberOrNull(data.weightKg),
        sleep: toSleep(data.sleep),
        updatedAt: typeof updatedAt?.toDate === 'function' ? updatedAt.toDate() : null,
    };
}

/** The device-derived metrics, as handed to recordDailyMetrics. Every
 * field is optional: a caller reports only what it actually knows. */
export interface MetricsPatch {
    steps?: number | null;
    caloriesBurned?: number | null;
    weightKg?: number | null;
    sleep?: SleepSnapshot | null;
}

/** Smallest change worth a write, per metric. Steps tick constantly, so
 * writing every one of them would cost a document write a second for a
 * number nobody reads between app launches. */
const STEP_EPSILON = 25;
const KCAL_EPSILON = 5;

/** Minimum gap between metric writes for the same day. */
export const METRICS_WRITE_INTERVAL_MS = 60_000;

/** Drops fields the caller left undefined, so a patch never writes a
 * metric its reporter knows nothing about. */
export function knownMetrics(patch: MetricsPatch): MetricsPatch {
    const known: MetricsPatch = {};
    if (patch.steps !== undefined) known.steps = patch.steps;
    if (patch.caloriesBurned !== undefined) known.caloriesBurned = patch.caloriesBurned;
    if (patch.weightKg !== undefined) known.weightKg = patch.weightKg;
    if (patch.sleep !== undefined) known.sleep = patch.sleep;
    return known;
}

function sleepDiffers(a: SleepSnapshot | null | undefined, b: SleepSnapshot | null | undefined) {
    if (!a || !b) return a !== b;
    return a.asleepMinutes !== b.asleepMinutes || a.inBedMinutes !== b.inBedMinutes;
}

/**
 * Whether a metrics write is worth making.
 *
 * Two independent brakes, because the pedometer reports continuously
 * while the dashboard is open:
 *   - nothing moved by a meaningful amount → nothing to say;
 *   - it moved, but the last write was seconds ago → say it later.
 *
 * The first write for a day always passes: that is what creates the row.
 */
export function shouldWriteMetrics(
    previous: { metrics: MetricsPatch; atMs: number } | null,
    next: MetricsPatch,
    nowMs: number,
    intervalMs: number = METRICS_WRITE_INTERVAL_MS,
): boolean {
    const known = knownMetrics(next);
    if (Object.keys(known).length === 0) return false;
    if (!previous) return true;

    const prev = previous.metrics;
    const changed =
        (known.steps !== undefined &&
            Math.abs((known.steps ?? 0) - (prev.steps ?? 0)) >= STEP_EPSILON) ||
        (known.caloriesBurned !== undefined &&
            Math.abs((known.caloriesBurned ?? 0) - (prev.caloriesBurned ?? 0)) >= KCAL_EPSILON) ||
        (known.weightKg !== undefined && known.weightKg !== prev.weightKg) ||
        (known.sleep !== undefined && sleepDiffers(known.sleep, prev.sleep));

    if (!changed) return false;
    return nowMs - previous.atMs >= intervalMs;
}
