import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WEIGHT_KG,
  estimateWorkoutStats,
  formatRecovery,
  toWorkoutStats,
  type ExerciseMeta,
} from '../workoutStats.ts';

const benchPress: ExerciseMeta = {
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps', 'shoulders'],
  mechanic: 'compound',
  category: 'strength',
};

const curl: ExerciseMeta = {
  primaryMuscles: ['biceps'],
  secondaryMuscles: [],
  mechanic: 'isolation',
  category: 'strength',
};

const sets = (count: number, reps: number, weight: number) =>
  Array.from({ length: count }, () => ({ reps, weight }));

test('returns null when nothing was performed', () => {
  assert.equal(
    estimateWorkoutStats({ exercises: [{ sets: sets(3, 0, 0), meta: benchPress }] }),
    null,
  );
  assert.equal(estimateWorkoutStats({ exercises: [] }), null);
});

test('volume is the sum of reps x weight, and untouched sets do not count', () => {
  const stats = estimateWorkoutStats({
    exercises: [{ sets: [...sets(3, 10, 60), { reps: 0, weight: 0 }], meta: benchPress }],
  });
  assert.equal(stats?.volumeKg, 1800);
  assert.equal(stats?.totalSets, 3);
  assert.equal(stats?.totalReps, 30);
});

test('calories scale with body weight', () => {
  const exercises = [{ sets: sets(4, 10, 60), meta: benchPress }];
  const light = estimateWorkoutStats({ exercises, bodyWeightKg: 60 })!;
  const heavy = estimateWorkoutStats({ exercises, bodyWeightKg: 90 })!;
  assert.ok(heavy.caloriesBurned > light.caloriesBurned);
  assert.equal(light.weightKgUsed, 60);
});

test('a missing or invalid body weight falls back to the default', () => {
  const exercises = [{ sets: sets(3, 10, 40), meta: benchPress }];
  assert.equal(estimateWorkoutStats({ exercises })?.weightKgUsed, DEFAULT_WEIGHT_KG);
  assert.equal(
    estimateWorkoutStats({ exercises, bodyWeightKg: -5 })?.weightKgUsed,
    DEFAULT_WEIGHT_KG,
  );
});

test('compound work burns more per session than isolation work of the same size', () => {
  const compound = estimateWorkoutStats({
    exercises: [{ sets: sets(4, 10, 30), meta: benchPress }],
    bodyWeightKg: 70,
  })!;
  const isolation = estimateWorkoutStats({
    exercises: [{ sets: sets(4, 10, 30), meta: curl }],
    bodyWeightKg: 70,
  })!;
  assert.ok(compound.caloriesBurned > isolation.caloriesBurned);
});

test('fat loss is the energy-balance equivalent of calories burned', () => {
  const stats = estimateWorkoutStats({
    exercises: [{ sets: sets(5, 8, 80), meta: benchPress }],
    bodyWeightKg: 80,
  })!;
  assert.equal(stats.fatLossGrams, Math.round((stats.caloriesBurned / 7.7) * 10) / 10);
});

test('more sets on a muscle means a longer recovery', () => {
  const few = estimateWorkoutStats({ exercises: [{ sets: sets(3, 10, 50), meta: benchPress }] })!;
  const many = estimateWorkoutStats({ exercises: [{ sets: sets(10, 10, 50), meta: benchPress }] })!;
  assert.ok(many.recoveryHours > few.recoveryHours);
});

test('recovery is clamped to the 24-96 hour range', () => {
  const huge = estimateWorkoutStats({ exercises: [{ sets: sets(60, 3, 100), meta: benchPress }] })!;
  assert.equal(huge.recoveryHours, 96);
});

test('large muscles recover slower than small ones for the same sets', () => {
  const chest = estimateWorkoutStats({ exercises: [{ sets: sets(4, 10, 40), meta: benchPress }] })!;
  const biceps = estimateWorkoutStats({ exercises: [{ sets: sets(4, 10, 40), meta: curl }] })!;
  assert.ok(chest.recoveryHours > biceps.recoveryHours);
});

test('heavy low-rep work recovers slower than light high-rep work', () => {
  const heavy = estimateWorkoutStats({ exercises: [{ sets: sets(4, 5, 100), meta: benchPress }] })!;
  const light = estimateWorkoutStats({ exercises: [{ sets: sets(4, 20, 20), meta: benchPress }] })!;
  assert.ok(heavy.recoveryHours > light.recoveryHours);
});

test('a lightly involved secondary muscle does not drive recovery', () => {
  const stats = estimateWorkoutStats({ exercises: [{ sets: sets(3, 10, 50), meta: benchPress }] })!;
  // 3 sets -> triceps/shoulders get 1.5 effective sets, under the threshold.
  assert.deepEqual(
    stats.recoveryMuscles.map((entry) => entry.muscle),
    ['chest'],
  );
});

test('recoveryMuscles lists the hardest-hit first, at most three', () => {
  const legs: ExerciseMeta = {
    primaryMuscles: ['quadriceps', 'glutes', 'hamstrings', 'calves'],
    secondaryMuscles: [],
    mechanic: 'compound',
  };
  const stats = estimateWorkoutStats({ exercises: [{ sets: sets(5, 8, 80), meta: legs }] })!;
  assert.equal(stats.recoveryMuscles.length, 3);
  const hours = stats.recoveryMuscles.map((entry) => entry.hours);
  assert.deepEqual(hours, [...hours].sort((a, b) => b - a));
});

test('stretching sets are ignored entirely', () => {
  const stretch: ExerciseMeta = {
    primaryMuscles: ['hamstrings'],
    secondaryMuscles: [],
    mechanic: null,
    category: 'stretching',
  };
  assert.equal(estimateWorkoutStats({ exercises: [{ sets: sets(3, 10, 0), meta: stretch }] }), null);
});

test('sets still count toward volume and time when the exercise record is missing', () => {
  const stats = estimateWorkoutStats({ exercises: [{ sets: sets(3, 10, 40), meta: null }] })!;
  assert.equal(stats.volumeKg, 1200);
  assert.ok(stats.estimatedMinutes > 0);
  // No muscle information -> the documented fallback, and no muscle list.
  assert.equal(stats.recoveryHours, 48);
  assert.deepEqual(stats.recoveryMuscles, []);
});

test('bodyweight sets (no load) still produce time, calories and recovery', () => {
  const pushUp: ExerciseMeta = {
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    mechanic: 'compound',
  };
  const stats = estimateWorkoutStats({
    exercises: [{ sets: sets(4, 15, 0), meta: pushUp }],
    bodyWeightKg: 70,
  })!;
  assert.equal(stats.volumeKg, 0);
  assert.ok(stats.caloriesBurned > 0);
  assert.ok(stats.recoveryHours >= 24);
});

test('toWorkoutStats round-trips an estimate', () => {
  const stats = estimateWorkoutStats({
    exercises: [{ sets: sets(4, 10, 60), meta: benchPress }],
    bodyWeightKg: 75,
  })!;
  assert.deepEqual(toWorkoutStats(JSON.parse(JSON.stringify(stats))), stats);
});

test('toWorkoutStats reads nothing from a log that predates stats', () => {
  assert.equal(toWorkoutStats(undefined), undefined);
  assert.equal(toWorkoutStats(null), undefined);
  assert.equal(toWorkoutStats({}), undefined);
  assert.equal(toWorkoutStats('nope'), undefined);
});

test('formatRecovery reads in hours under a day and days above it', () => {
  assert.equal(formatRecovery(20), '20 h');
  assert.equal(formatRecovery(24), '1 day');
  assert.equal(formatRecovery(36), '1.5 days');
  assert.equal(formatRecovery(48), '2 days');
});
