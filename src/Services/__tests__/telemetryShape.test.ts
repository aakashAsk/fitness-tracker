import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DAILY_GLASS_GOAL,
    METRICS_WRITE_INTERVAL_MS,
    ML_PER_GLASS,
    glassesFrom,
    knownMetrics,
    sanitiseWater,
    shouldWriteMetrics,
    telemetryDocId,
    toTelemetryDay,
    totalMl,
    type MetricsPatch,
} from '../telemetryShape.ts';

test('telemetryDocId is one row per user per day', () => {
    assert.equal(telemetryDocId('uid1', '2026-09-20'), 'uid1_2026-09-20');
    assert.notEqual(telemetryDocId('uid1', '2026-09-20'), telemetryDocId('uid2', '2026-09-20'));
});

test('totalMl and glassesFrom read a day of drinks', () => {
    const entries = [
        { ml: 250, time: '8:00 AM' },
        { ml: 300, time: '9:30 AM' },
    ];
    assert.equal(totalMl(entries), 550);
    // 550ml is two whole glasses and a bit — the bit does not fill a tile.
    assert.equal(glassesFrom(entries), 2);
    assert.equal(totalMl([]), 0);
});

test('glassesFrom caps at the goal so the tracker cannot overflow', () => {
    const tenGlasses = Array.from({ length: 10 }, () => ({ ml: ML_PER_GLASS, time: '' }));
    assert.equal(glassesFrom(tenGlasses), DAILY_GLASS_GOAL);
});

test('sanitiseWater drops entries that record nothing and rounds the rest', () => {
    const cleaned = sanitiseWater([
        { ml: 250.4, time: '8:00 AM' },
        { ml: 0, time: '9:00 AM' },
        { ml: -100, time: '10:00 AM' },
    ]);
    assert.deepEqual(cleaned, [{ ml: 250, time: '8:00 AM' }]);
});

test('toTelemetryDay defaults a missing metric to null, not zero', () => {
    const day = toTelemetryDay('uid_2026-09-20', { userId: 'uid', date: '2026-09-20' });
    // The distinction the dashboard depends on: nothing reported yet is
    // not the same claim as a measured zero.
    assert.equal(day.steps, null);
    assert.equal(day.caloriesBurned, null);
    assert.equal(day.weightKg, null);
    assert.equal(day.sleep, null);
    assert.deepEqual(day.water, []);
    assert.equal(day.updatedAt, null);
});

test('toTelemetryDay keeps a real zero as zero', () => {
    const day = toTelemetryDay('id', { userId: 'u', date: 'd', steps: 0, caloriesBurned: 0 });
    assert.equal(day.steps, 0);
    assert.equal(day.caloriesBurned, 0);
});

test('toTelemetryDay reads stored water and sleep back', () => {
    const day = toTelemetryDay('id', {
        userId: 'u',
        date: '2026-09-20',
        water: [{ ml: 250, time: '8:00 AM' }, { ml: 0, time: 'noise' }],
        sleep: {
            asleepMinutes: 452,
            inBedMinutes: 480,
            start: '2026-09-19T23:04:00.000Z',
            end: '2026-09-20T06:36:00.000Z',
            stages: { deep: 80, rem: 105, light: 267, awake: 28 },
        },
    });
    assert.deepEqual(day.water, [{ ml: 250, time: '8:00 AM' }]);
    assert.equal(day.sleep?.asleepMinutes, 452);
    assert.equal(day.sleep?.stages?.deep, 80);
});

test('toTelemetryDay resolves a Firestore timestamp but tolerates an unresolved one', () => {
    const when = new Date('2026-09-20T10:00:00.000Z');
    const resolved = toTelemetryDay('id', { updatedAt: { toDate: () => when } });
    assert.equal(resolved.updatedAt?.getTime(), when.getTime());
    // serverTimestamp() has no toDate() until the server answers.
    assert.equal(toTelemetryDay('id', { updatedAt: {} }).updatedAt, null);
});

test('knownMetrics keeps an explicit null but drops an unreported field', () => {
    const patch = knownMetrics({ steps: 500, caloriesBurned: null });
    assert.deepEqual(patch, { steps: 500, caloriesBurned: null });
    assert.equal('weightKg' in patch, false);
    assert.equal('sleep' in patch, false);
});

const T0 = 1_000_000;
const before = (metrics: MetricsPatch, atMs = T0) => ({ metrics, atMs });

test('shouldWriteMetrics always writes the first reading of a day', () => {
    assert.equal(shouldWriteMetrics(null, { steps: 10 }, T0), true);
});

test('shouldWriteMetrics refuses a patch that reports nothing', () => {
    assert.equal(shouldWriteMetrics(null, {}, T0), false);
});

test('shouldWriteMetrics ignores step noise below the threshold', () => {
    const later = T0 + METRICS_WRITE_INTERVAL_MS * 2;
    assert.equal(shouldWriteMetrics(before({ steps: 1000 }), { steps: 1010 }, later), false);
    assert.equal(shouldWriteMetrics(before({ steps: 1000 }), { steps: 1030 }, later), true);
});

test('shouldWriteMetrics holds a real change back until the interval has passed', () => {
    const tooSoon = T0 + METRICS_WRITE_INTERVAL_MS - 1;
    assert.equal(shouldWriteMetrics(before({ steps: 1000 }), { steps: 5000 }, tooSoon), false);
    assert.equal(
        shouldWriteMetrics(before({ steps: 1000 }), { steps: 5000 }, T0 + METRICS_WRITE_INTERVAL_MS),
        true,
    );
});

test('shouldWriteMetrics treats a weigh-in as a change at any size', () => {
    const later = T0 + METRICS_WRITE_INTERVAL_MS;
    assert.equal(shouldWriteMetrics(before({ weightKg: 68.4 }), { weightKg: 68.3 }, later), true);
    assert.equal(shouldWriteMetrics(before({ weightKg: 68.4 }), { weightKg: 68.4 }, later), false);
});

test('shouldWriteMetrics writes sleep when it first arrives or changes', () => {
    const later = T0 + METRICS_WRITE_INTERVAL_MS;
    const sleep = { asleepMinutes: 452, inBedMinutes: 480, start: null, end: null, stages: null };
    assert.equal(shouldWriteMetrics(before({ sleep: null }), { sleep }, later), true);
    assert.equal(shouldWriteMetrics(before({ sleep }), { sleep: { ...sleep } }, later), false);
    assert.equal(
        shouldWriteMetrics(before({ sleep }), { sleep: { ...sleep, asleepMinutes: 460 } }, later),
        true,
    );
});
