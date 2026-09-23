import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeConsistencyProgress,
  computeFatLossProgress,
  computeMuscleGainProgress,
  linearTrendPerWeek,
  type WeightPoint,
} from '../goalProgressService.ts';

// ── linearTrendPerWeek ───────────────────────────────────────────────────

test('linearTrendPerWeek needs at least two points', () => {
  assert.equal(linearTrendPerWeek([]), null);
  assert.equal(linearTrendPerWeek([{ date: '2026-09-01', weightKg: 80 }]), null);
});

test('linearTrendPerWeek needs at least a week of span', () => {
  const points: WeightPoint[] = [
    { date: '2026-09-01', weightKg: 80 },
    { date: '2026-09-03', weightKg: 79.5 },
  ];
  assert.equal(linearTrendPerWeek(points), null);
});

test('linearTrendPerWeek fits a straight loss trend exactly', () => {
  // Exactly -0.5 kg/week over 4 weeks.
  const points: WeightPoint[] = [
    { date: '2026-09-01', weightKg: 82 },
    { date: '2026-09-08', weightKg: 81.5 },
    { date: '2026-09-15', weightKg: 81 },
    { date: '2026-09-22', weightKg: 80.5 },
  ];
  assert.equal(linearTrendPerWeek(points), -0.5);
});

test('linearTrendPerWeek is flat for an unchanging weight', () => {
  const points: WeightPoint[] = [
    { date: '2026-09-01', weightKg: 80 },
    { date: '2026-09-15', weightKg: 80 },
  ];
  assert.equal(linearTrendPerWeek(points), 0);
});

test('linearTrendPerWeek ignores point order', () => {
  const points: WeightPoint[] = [
    { date: '2026-09-15', weightKg: 81 },
    { date: '2026-09-01', weightKg: 82 },
  ];
  assert.equal(linearTrendPerWeek(points), -0.5);
});

// ── computeFatLossProgress ───────────────────────────────────────────────

const fatLossBase = { startWeightKg: 82, currentWeightKg: 80, targetWeeklyPaceKg: 0.5 };

test('fat-loss: not enough weigh-ins is insufficient-data', () => {
  const result = computeFatLossProgress({ ...fatLossBase, weightHistory: [] });
  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.changeLabel, '-2 kg since you started');
});

test('fat-loss: losing at roughly the target pace is on-track', () => {
  const result = computeFatLossProgress({
    ...fatLossBase,
    weightHistory: [
      { date: '2026-09-01', weightKg: 82 },
      { date: '2026-09-15', weightKg: 81 }, // -0.5 kg/week
    ],
  });
  assert.equal(result.status, 'on-track');
});

test('fat-loss: losing much faster than the target is ahead', () => {
  const result = computeFatLossProgress({
    ...fatLossBase,
    weightHistory: [
      { date: '2026-09-01', weightKg: 82 },
      { date: '2026-09-15', weightKg: 80 }, // -1 kg/week, double the target
    ],
  });
  assert.equal(result.status, 'ahead');
});

test('fat-loss: losing much slower than the target is behind', () => {
  const result = computeFatLossProgress({
    ...fatLossBase,
    weightHistory: [
      { date: '2026-09-01', weightKg: 82 },
      { date: '2026-09-15', weightKg: 81.8 }, // -0.1 kg/week
    ],
  });
  assert.equal(result.status, 'behind');
});

test('fat-loss: gaining weight while the goal is loss is behind', () => {
  const result = computeFatLossProgress({
    ...fatLossBase,
    weightHistory: [
      { date: '2026-09-01', weightKg: 82 },
      { date: '2026-09-15', weightKg: 83 },
    ],
  });
  assert.equal(result.status, 'behind');
});

test('fat-loss: changeLabel is null with no current weigh-in', () => {
  const result = computeFatLossProgress({ ...fatLossBase, currentWeightKg: null, weightHistory: [] });
  assert.equal(result.changeLabel, null);
});

// ── computeMuscleGainProgress ────────────────────────────────────────────

const session = (volume: number) => ({
  date: '2026-09-01',
  volume,
  topWeight: 0,
  avgWeight: 0,
  sets: 1,
  reps: 1,
});

test('muscle-gain: no recent sessions is insufficient-data', () => {
  const result = computeMuscleGainProgress({ recentSessions: [], previousSessions: [] });
  assert.equal(result.status, 'insufficient-data');
});

test('muscle-gain: no previous-window data is insufficient-data, not a fake 0%', () => {
  const result = computeMuscleGainProgress({ recentSessions: [session(1000)], previousSessions: [] });
  assert.equal(result.status, 'insufficient-data');
});

test('muscle-gain: rising volume is ahead', () => {
  const result = computeMuscleGainProgress({
    recentSessions: [session(1200)],
    previousSessions: [session(1000)],
  });
  assert.equal(result.status, 'ahead');
});

test('muscle-gain: stable volume is on-track', () => {
  const result = computeMuscleGainProgress({
    recentSessions: [session(1020)],
    previousSessions: [session(1000)],
  });
  assert.equal(result.status, 'on-track');
});

test('muscle-gain: falling volume is behind', () => {
  const result = computeMuscleGainProgress({
    recentSessions: [session(700)],
    previousSessions: [session(1000)],
  });
  assert.equal(result.status, 'behind');
});

// ── computeConsistencyProgress ───────────────────────────────────────────

test('consistency: nothing planned is insufficient-data', () => {
  const result = computeConsistencyProgress('maintenance', { plannedCount: 0, completedCount: 0 });
  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.percent, null);
});

test('consistency: 90%+ completion is ahead', () => {
  const result = computeConsistencyProgress('endurance', { plannedCount: 10, completedCount: 9 });
  assert.equal(result.status, 'ahead');
  assert.equal(result.percent, 90);
});

test('consistency: 70-89% completion is on-track', () => {
  const result = computeConsistencyProgress('maintenance', { plannedCount: 10, completedCount: 7 });
  assert.equal(result.status, 'on-track');
});

test('consistency: under 70% completion is behind', () => {
  const result = computeConsistencyProgress('maintenance', { plannedCount: 10, completedCount: 3 });
  assert.equal(result.status, 'behind');
  assert.equal(result.percent, 30);
});
