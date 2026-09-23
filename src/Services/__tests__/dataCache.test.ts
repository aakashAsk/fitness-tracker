import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    cacheClear,
    cacheInvalidate,
    cacheKey,
    cachePeek,
    cacheSet,
    cachedFetch,
} from '../dataCache.ts';

beforeEach(() => cacheClear());

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

test('cacheKey is source|user|date', () => {
    assert.equal(cacheKey('mealLogs', 'u1', '2026-09-21'), 'mealLogs|u1|2026-09-21');
});

test('peek misses when nothing is cached, and hits once set', () => {
    assert.equal(cachePeek('k'), undefined);
    cacheSet('k', 42);
    assert.deepEqual(cachePeek('k'), { value: 42 });
});

test('a cached null is a hit, not a miss', () => {
    cacheSet('k', null);
    assert.deepEqual(cachePeek('k'), { value: null });
});

test('entries expire after the max age', () => {
    cacheSet('k', 'v', 1_000);
    assert.deepEqual(cachePeek('k', 500, 1_400), { value: 'v' });
    assert.equal(cachePeek('k', 500, 1_600), undefined);
});

test('invalidate removes by prefix and leaves the rest', () => {
    cacheSet('mealLogs|u1|2026-09-21', 1);
    cacheSet('mealLogs|u1|2026-09-22', 2);
    cacheSet('mealLogs|u2|2026-09-21', 3);
    cacheInvalidate('mealLogs|u1|2026-09-21');
    assert.equal(cachePeek('mealLogs|u1|2026-09-21'), undefined);
    assert.deepEqual(cachePeek('mealLogs|u1|2026-09-22'), { value: 2 });
    assert.deepEqual(cachePeek('mealLogs|u2|2026-09-21'), { value: 3 });
});

test('cachedFetch loads once, then serves from the cache', async () => {
    let calls = 0;
    const loader = async () => ++calls;
    assert.equal(await cachedFetch('k', loader), 1);
    assert.equal(await cachedFetch('k', loader), 1);
    assert.equal(calls, 1);
});

test('force skips the cache and refreshes it', async () => {
    let calls = 0;
    const loader = async () => ++calls;
    await cachedFetch('k', loader);
    assert.equal(await cachedFetch('k', loader, { force: true }), 2);
    assert.equal(await cachedFetch('k', loader), 2);
});

test('concurrent callers share one load', async () => {
    let calls = 0;
    const gate = deferred<string>();
    const loader = () => {
        calls += 1;
        return gate.promise;
    };
    const all = Promise.all([
        cachedFetch('k', loader),
        cachedFetch('k', loader),
        cachedFetch('k', loader),
    ]);
    gate.resolve('shared');
    assert.deepEqual(await all, ['shared', 'shared', 'shared']);
    assert.equal(calls, 1);
});

test('a failed load is not cached and can be retried', async () => {
    let calls = 0;
    const flaky = async () => {
        calls += 1;
        if (calls === 1) throw new Error('boom');
        return 'ok';
    };
    await assert.rejects(() => cachedFetch('k', flaky), /boom/);
    assert.equal(await cachedFetch('k', flaky), 'ok');
});

test('invalidating drops the cached value so the next read loads', async () => {
    let calls = 0;
    const loader = async () => ++calls;
    await cachedFetch('mealLogs|u|d', loader);
    cacheInvalidate('mealLogs|u|d');
    assert.equal(await cachedFetch('mealLogs|u|d', loader), 2);
});

test('a read that was in flight during an invalidation does not cache its stale result', async () => {
    const slow = deferred<string>();
    const stale = cachedFetch('k', () => slow.promise);

    // A write lands while the read is still out.
    cacheInvalidate('k');
    slow.resolve('pre-write');
    assert.equal(await stale, 'pre-write');

    // The pre-write value must not have been stored...
    assert.equal(cachePeek('k'), undefined);
    // ...and the next read goes to the source.
    assert.equal(await cachedFetch('k', async () => 'post-write'), 'post-write');
});

test('a read after an invalidation does not join a pre-invalidation read', async () => {
    const slow = deferred<string>();
    const before = cachedFetch('k', () => slow.promise);
    cacheInvalidate('k');

    let ranFresh = false;
    const after = cachedFetch('k', async () => {
        ranFresh = true;
        return 'fresh';
    });
    assert.equal(await after, 'fresh');
    assert.equal(ranFresh, true);

    slow.resolve('stale');
    await before;
    // The fresh read's value is the one that stays cached.
    assert.deepEqual(cachePeek('k'), { value: 'fresh' });
});

test('clear empties everything', () => {
    cacheSet('a', 1);
    cacheSet('b', 2);
    cacheClear();
    assert.equal(cachePeek('a'), undefined);
    assert.equal(cachePeek('b'), undefined);
});
