// Firestore-backed daily telemetry — one document per (user, date),
// holding everything the dashboard shows for that day: water, steps,
// calories burned, sleep and body weight.
//
// This replaces the `hydrationLogs` collection, which held water alone.
// Water is now the `water` field here, so a day is one read instead of
// one per metric, and metrics that were previously kept only on the
// device (steps, sleep) now leave a history behind them.
//
// Every shape rule lives in ./telemetryShape, which has no Firestore
// import and carries the tests.
import {
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    where,
} from 'firebase/firestore';
import { db } from '../Firebase/firebaseConfig';
import { getCurrentUserId } from './userService';
import { cacheInvalidate, cacheKey, cachePeek, cachedFetch } from './dataCache';
import {
    knownMetrics,
    sanitiseWater,
    shouldWriteMetrics,
    telemetryDocId,
    toTelemetryDay,
    type MetricsPatch,
    type TelemetryDay,
    type WaterEntry,
} from './telemetryShape';

const TELEMETRY_COLLECTION = 'telemetry';

/**
 * The collection telemetry replaced. Read only, and only to carry a
 * user's existing water history forward the first time they open a day
 * that predates the change — see fetchTelemetry.
 *
 * SAFE TO DELETE once no user has unmigrated days worth keeping: remove
 * this constant, readLegacyWater and its call below, then drop the
 * collection and its rule from firestore.rules.
 */
const LEGACY_HYDRATION_COLLECTION = 'hydrationLogs';

export class TelemetryServiceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TelemetryServiceError';
    }
}

export * from './telemetryShape';

/**
 * That day's water as the old collection stored it, or null.
 *
 * Failures are swallowed rather than surfaced: this is a best-effort
 * look at a collection that is on its way out, and a user whose legacy
 * day cannot be read should still get a working — if empty — tracker
 * rather than an error about a collection they have never heard of.
 */
async function readLegacyWater(userId: string, date: string): Promise<WaterEntry[] | null> {
    try {
        const snapshot = await getDoc(
            doc(db, LEGACY_HYDRATION_COLLECTION, telemetryDocId(userId, date)),
        );
        if (!snapshot.exists()) return null;
        const entries = ((snapshot.data().entries as unknown[]) ?? [])
            .map((raw) => (raw ?? {}) as Record<string, unknown>)
            .map((entry) => ({
                ml: Math.max(Number(entry.ml) || 0, 0),
                time: (entry.time as string) ?? '',
            }))
            .filter((entry) => entry.ml > 0);
        return entries.length > 0 ? entries : null;
    } catch {
        return null;
    }
}

const TELEMETRY_CACHE = 'telemetry';

/**
 * What is already known about one day, without a read: `undefined` when
 * nothing is cached, otherwise `{ day }` — where `day` is null for a day
 * that was read and has no row. Lets a screen paint its first frame from
 * memory instead of showing a loading state for data it already has.
 */
export function peekTelemetry(date: string): { day: TelemetryDay | null } | undefined {
    const hit = cachePeek<TelemetryDay | null>(
        cacheKey(TELEMETRY_CACHE, getCurrentUserId(), date),
    );
    return hit ? { day: hit.value } : undefined;
}

/** Drops a day's cached row — every write that changes what a read of
 * that day returns calls this, so the next read goes to Firestore.
 *
 * Also drops every cached RANGE for this user, not just ranges that
 * provably include `date`: a range cache key is the whole (start, end)
 * pair, so there is no cheap way to tell which cached ranges overlap one
 * date. Ranges are read far less often than single days (trend widgets,
 * not every dashboard mount), so clearing all of a user's makes the
 * write correct without needing per-range bookkeeping. */
function invalidateTelemetry(userId: string, date: string): void {
    cacheInvalidate(cacheKey(TELEMETRY_CACHE, userId, date));
    cacheInvalidate(cacheKey(TELEMETRY_RANGE_CACHE, userId, ''));
}

/**
 * One day's telemetry, or null when the day has nothing recorded.
 *
 * Served from memory when this day was read recently (see dataCache);
 * `force` reads for real. Water and weight writes below drop the cached
 * day themselves.
 */
export function fetchTelemetry(
    date: string,
    options?: { force?: boolean },
): Promise<TelemetryDay | null> {
    const userId = getCurrentUserId();
    return cachedFetch(
        cacheKey(TELEMETRY_CACHE, userId, date),
        () => loadTelemetry(userId, date),
        options,
    );
}

/**
 * The uncached read.
 *
 * A day with no telemetry document falls back to the old hydration
 * collection, so water logged before this change still appears. Nothing
 * is written back here — the copy happens on the next save, which sends
 * the full entry list the screen is holding anyway.
 */
async function loadTelemetry(userId: string, date: string): Promise<TelemetryDay | null> {
    try {
        const snapshot = await getDoc(doc(db, TELEMETRY_COLLECTION, telemetryDocId(userId, date)));
        const day = snapshot.exists() ? toTelemetryDay(snapshot.id, snapshot.data()) : null;
        if (day && day.water.length > 0) return day;

        const legacyWater = await readLegacyWater(userId, date);
        if (!legacyWater) return day;

        return day
            ? { ...day, water: legacyWater }
            : {
                  id: telemetryDocId(userId, date),
                  userId,
                  date,
                  water: legacyWater,
                  steps: null,
                  caloriesBurned: null,
                  weightKg: null,
                  sleep: null,
                  updatedAt: null,
              };
    } catch (err) {
        throw new TelemetryServiceError(
            err instanceof Error ? err.message : 'Failed to load your daily telemetry.',
        );
    }
}

/**
 * Writes the day's drinks, replacing whatever was stored.
 *
 * The whole array is sent rather than an arrayUnion: entries are also
 * removed and reordered here, and a day holds a handful of them at
 * most, so a full rewrite is simpler than reconciling two operations —
 * and it keeps the document consistent with what the caller just showed
 * on screen.
 */
export async function saveWaterEntries(date: string, entries: WaterEntry[]): Promise<void> {
    const userId = getCurrentUserId();
    try {
        await setDoc(
            doc(db, TELEMETRY_COLLECTION, telemetryDocId(userId, date)),
            {
                userId,
                date,
                water: sanitiseWater(entries),
                updatedAt: serverTimestamp(),
            },
            // merge: the day's steps and sleep are written by a different
            // path and must survive a drink being logged.
            { merge: true },
        );
        invalidateTelemetry(userId, date);
    } catch (err) {
        throw new TelemetryServiceError(
            err instanceof Error ? err.message : 'Failed to save water intake.',
        );
    }
}

/** Last metrics write per date key, so the throttle survives re-renders
 *  without the caller having to hold it. */
const lastWrite = new Map<string, { metrics: MetricsPatch; atMs: number }>();

/**
 * Records device-derived metrics for a day: steps, calories, sleep.
 *
 * Called on every reading the dashboard takes, and mostly does nothing —
 * see shouldWriteMetrics. Resolves to whether it actually wrote.
 *
 * Never throws. These are a by-product of showing the dashboard, not
 * something the user asked for, so a failure here must not surface as an
 * error over a screen that is otherwise working. The throttle is only
 * updated on success, so a failed write is retried at the next reading.
 */
export async function recordDailyMetrics(date: string, patch: MetricsPatch): Promise<boolean> {
    const known = knownMetrics(patch);
    const previous = lastWrite.get(date) ?? null;
    if (!shouldWriteMetrics(previous, known, Date.now())) return false;

    const userId = getCurrentUserId();
    try {
        await setDoc(
            doc(db, TELEMETRY_COLLECTION, telemetryDocId(userId, date)),
            { userId, date, ...known, updatedAt: serverTimestamp() },
            { merge: true },
        );
        lastWrite.set(date, { metrics: { ...previous?.metrics, ...known }, atMs: Date.now() });
        // Not invalidated, on purpose: this runs on every sensor reading,
        // so dropping the day here would defeat the cache. The dashboard
        // reads steps, calories and sleep live from their own sources and
        // takes only water and weight from the row — the two fields this
        // path never touches.
        return true;
    } catch {
        return false;
    }
}

/**
 * Records a weigh-in for a day.
 *
 * Separate from recordDailyMetrics because a weight is something the
 * user states rather than something a sensor reports: it is never
 * throttled, never skipped as "close enough", and a failure is worth
 * telling them about.
 */
export async function saveDailyWeight(date: string, weightKg: number): Promise<void> {
    const userId = getCurrentUserId();
    try {
        await setDoc(
            doc(db, TELEMETRY_COLLECTION, telemetryDocId(userId, date)),
            {
                userId,
                date,
                weightKg: Math.round(weightKg * 10) / 10,
                updatedAt: serverTimestamp(),
            },
            { merge: true },
        );
        invalidateTelemetry(userId, date);
        // Keep the throttle's picture current, or the next metrics write
        // would treat this weight as a change and write it straight back.
        const previous = lastWrite.get(date);
        if (previous) previous.metrics.weightKg = weightKg;
    } catch (err) {
        throw new TelemetryServiceError(
            err instanceof Error ? err.message : 'Failed to save your weight.',
        );
    }
}

/** Clears the metrics throttle — for sign-out, so the next user's first
 *  reading writes instead of being compared against someone else's. */
export function resetTelemetryThrottle(): void {
    lastWrite.clear();
}

const TELEMETRY_RANGE_CACHE = 'telemetryRange';

/**
 * Every telemetry row between two dates (inclusive), oldest first.
 *
 * For the dashboard's trend widgets — weight history, weekly step
 * totals — which need several days at once rather than one. Days with
 * no document simply have no entry in the result; callers must not
 * assume one row per calendar day.
 *
 * The equality filter on `userId` plus the range filter on `date` needs
 * a composite index (see firestore.indexes.json) — Firestore cannot
 * serve equality + range from single-field indexes the way it can two
 * equalities (see loadTelemetry's sibling queries elsewhere in this file
 * for the equality-only case).
 */
export function fetchTelemetryRange(
    startDate: string,
    endDate: string,
    options?: { force?: boolean },
): Promise<TelemetryDay[]> {
    const userId = getCurrentUserId();
    return cachedFetch(
        cacheKey(TELEMETRY_RANGE_CACHE, userId, `${startDate}_${endDate}`),
        () => loadTelemetryRange(userId, startDate, endDate),
        options,
    );
}

async function loadTelemetryRange(
    userId: string,
    startDate: string,
    endDate: string,
): Promise<TelemetryDay[]> {
    try {
        const q = query(
            collection(db, TELEMETRY_COLLECTION),
            where('userId', '==', userId),
            where('date', '>=', startDate),
            where('date', '<=', endDate),
            orderBy('date', 'asc'),
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => toTelemetryDay(d.id, d.data()));
    } catch (err) {
        throw new TelemetryServiceError(
            err instanceof Error ? err.message : 'Failed to load your telemetry history.',
        );
    }
}
