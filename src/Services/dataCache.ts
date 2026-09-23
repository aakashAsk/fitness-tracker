// An in-memory read cache for the per-day data the dashboard (and the
// tabs that share its hooks) keeps asking Firestore for.
//
// The problem it solves: every Home visit remounts the dashboard, and
// every mounted section used to fetch its data from scratch — the same
// meal-log query three times over, the same telemetry row again on every
// return to the tab — and the screen sat behind a skeleton while it did.
// Data that has not changed does not need fetching again.
//
// Deliberately small and dumb:
//  - It lives in module memory, so it survives tab switches (which
//    unmount screens) but not an app restart. Nothing is persisted.
//  - Entries are keyed by `source|userId|date` (see cacheKey), so one
//    account can never read another's rows and a new day is a new key.
//  - The WRITE paths own invalidation: whoever saves a row for a date
//    drops that date's entries in the same function (see the services).
//    That keeps "what does this write make stale" next to the write.
//  - A max age is the safety net for changes this device never wrote —
//    another device, the Firebase console.
//
// Pure — no Firestore, no React — so the rules can be unit-tested.

/** How long an entry counts as fresh when the caller does not say. */
export const DEFAULT_MAX_AGE_MS = 5 * 60_000;

interface Entry {
    value: unknown;
    at: number;
}

const store = new Map<string, Entry>();

/**
 * Bumped by every invalidation. A read remembers the value it started
 * under and only writes its result back if nothing was invalidated while
 * it was in flight — otherwise a slow read that began BEFORE a write
 * would land AFTER the write's invalidation and put the pre-write data
 * back, which is exactly the stale row the invalidation exists to remove.
 */
let epoch = 0;

interface Inflight {
    epoch: number;
    promise: Promise<unknown>;
}

const inflight = new Map<string, Inflight>();

/** `source|userId|date` — the one place that spells the key. */
export function cacheKey(source: string, userId: string, date: string): string {
    return `${source}|${userId}|${date}`;
}

/**
 * The cached value, or undefined when there is none or it has aged out.
 *
 * Returned wrapped in `{ value }` because "cached, and the answer was
 * null" (a day with no telemetry row yet) is a real result that must be
 * told apart from "not cached".
 */
export function cachePeek<T>(
    key: string,
    maxAgeMs: number = DEFAULT_MAX_AGE_MS,
    nowMs: number = Date.now(),
): { value: T } | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (nowMs - entry.at > maxAgeMs) return undefined;
    return { value: entry.value as T };
}

export function cacheSet<T>(key: string, value: T, nowMs: number = Date.now()): void {
    store.set(key, { value, at: nowMs });
}

/** Drops every entry whose key starts with `prefix` — e.g. all sources
 * for one user and date, or one source for a user. */
export function cacheInvalidate(prefix: string): void {
    epoch += 1;
    for (const key of Array.from(store.keys())) {
        if (key.startsWith(prefix)) store.delete(key);
    }
}

/** Empties everything — for sign-out. */
export function cacheClear(): void {
    epoch += 1;
    store.clear();
    inflight.clear();
}

export interface CachedFetchOptions {
    /** Skip the cache and read for real (still de-duplicated, and the
        result is cached). For an explicit refresh or a return to the
        foreground. */
    force?: boolean;
    maxAgeMs?: number;
}

/**
 * Returns the cached value when it is fresh; otherwise runs `loader`,
 * caches what it returns, and hands that back.
 *
 * Concurrent callers for one key share a single `loader` run — the
 * dashboard mounts several sections that ask for the same day at the
 * same moment, and they should cost one read between them. A failed
 * loader is not cached and rejects every caller that was waiting on it.
 */
export async function cachedFetch<T>(
    key: string,
    loader: () => Promise<T>,
    options: CachedFetchOptions = {},
): Promise<T> {
    if (!options.force) {
        const hit = cachePeek<T>(key, options.maxAgeMs);
        if (hit) return hit.value;
    }

    const startEpoch = epoch;
    const pending = inflight.get(key);
    // Only join a read that began under the current epoch: one that
    // started before an invalidation is carrying pre-write data.
    if (pending && pending.epoch === startEpoch) return pending.promise as Promise<T>;

    const promise: Promise<T> = loader()
        .then((value) => {
            if (epoch === startEpoch) cacheSet(key, value);
            return value;
        })
        .finally(() => {
            if (inflight.get(key)?.promise === promise) inflight.delete(key);
        });

    inflight.set(key, { epoch: startEpoch, promise });
    return promise;
}
