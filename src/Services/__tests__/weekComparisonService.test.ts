import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekComparison, type WeekComparisonInput } from '../weekComparisonService.ts';

const base: WeekComparisonInput = {
  avgCalories: { current: 2000, previous: 2000, target: 2000 },
  avgProtein: { current: 150, previous: 150, target: 150 },
  totalSteps: { current: 50_000, previous: 50_000 },
  workoutsCompleted: { current: 4, previous: 4 },
  totalVolumeKg: { current: 10_000, previous: 10_000 },
};

function metric(input: WeekComparisonInput, key: string) {
  const found = buildWeekComparison(input).find((entry) => entry.key === key);
  if (!found) throw new Error(`missing metric ${key}`);
  return found;
}

test('every metric key is present, once', () => {
  const keys = buildWeekComparison(base).map((m) => m.key);
  assert.deepEqual(keys, [
    'avgCalories',
    'avgProtein',
    'totalSteps',
    'workoutsCompleted',
    'totalVolumeKg',
  ]);
});

test('percentChange is the plain percentage difference', () => {
  const result = metric(
    { ...base, totalSteps: { current: 55_000, previous: 50_000 } },
    'totalSteps',
  );
  assert.equal(result.percentChange, 10);
});

test('percentChange is null (not Infinity) when the previous value was zero and current is not', () => {
  const result = metric({ ...base, workoutsCompleted: { current: 3, previous: 0 } }, 'workoutsCompleted');
  assert.equal(result.percentChange, null);
});

test('percentChange is 0 when both weeks were zero', () => {
  const result = metric({ ...base, workoutsCompleted: { current: 0, previous: 0 } }, 'workoutsCompleted');
  assert.equal(result.percentChange, 0);
});

test('higher-is-better metrics: more steps/workouts/volume is good, less is bad', () => {
  assert.equal(
    metric({ ...base, totalSteps: { current: 60_000, previous: 50_000 } }, 'totalSteps').tone,
    'good',
  );
  assert.equal(
    metric({ ...base, totalSteps: { current: 40_000, previous: 50_000 } }, 'totalSteps').tone,
    'bad',
  );
  assert.equal(
    metric({ ...base, workoutsCompleted: { current: 5, previous: 4 } }, 'workoutsCompleted').tone,
    'good',
  );
  assert.equal(
    metric({ ...base, totalVolumeKg: { current: 9000, previous: 10_000 } }, 'totalVolumeKg').tone,
    'bad',
  );
});

test('calories/protein: moving closer to target is good regardless of direction', () => {
  // Fat-loss user overshooting last week, closer to target this week.
  const closerFromAbove = metric(
    { ...base, avgCalories: { current: 2050, previous: 2300, target: 2000 } },
    'avgCalories',
  );
  assert.equal(closerFromAbove.tone, 'good');

  // A bulking user undershooting last week, closer to a higher target now.
  const closerFromBelow = metric(
    { ...base, avgCalories: { current: 2700, previous: 2400, target: 2800 } },
    'avgCalories',
  );
  assert.equal(closerFromBelow.tone, 'good');
});

test('calories/protein: moving further from target is bad', () => {
  const result = metric(
    { ...base, avgProtein: { current: 90, previous: 130, target: 150 } },
    'avgProtein',
  );
  assert.equal(result.tone, 'bad');
});

test('calories/protein: staying about the same distance from target is neutral', () => {
  const result = metric(
    { ...base, avgCalories: { current: 2010, previous: 1995, target: 2000 } },
    'avgCalories',
  );
  assert.equal(result.tone, 'neutral');
});

test('a zero target is neutral rather than a division error', () => {
  const result = metric({ ...base, avgProtein: { current: 100, previous: 80, target: 0 } }, 'avgProtein');
  assert.equal(result.tone, 'neutral');
});
