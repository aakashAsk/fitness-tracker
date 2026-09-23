import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthlyHeatmap,
  currentWorkoutStreak,
  detectPersonalRecords,
} from '../streakService.ts';

const today = new Date('2026-09-23T09:00:00'); // a Wednesday

test('streak counts consecutive days ending today', () => {
  const dates = ['2026-09-21', '2026-09-22', '2026-09-23'];
  assert.equal(currentWorkoutStreak(dates, today), 3);
});

test('streak still counts when today has not been logged yet, via yesterday', () => {
  const dates = ['2026-09-20', '2026-09-21', '2026-09-22'];
  assert.equal(currentWorkoutStreak(dates, today), 3);
});

test('streak is 0 once a full day has been skipped', () => {
  const dates = ['2026-09-20', '2026-09-21']; // gap on the 22nd, nothing today
  assert.equal(currentWorkoutStreak(dates, today), 0);
});

test('streak is 0 with no logged days at all', () => {
  assert.equal(currentWorkoutStreak([], today), 0);
});

test('streak stops at the first gap looking backward', () => {
  const dates = ['2026-09-15', '2026-09-22', '2026-09-23']; // gap before the 22nd
  assert.equal(currentWorkoutStreak(dates, today), 2);
});

test('monthly heatmap covers every day of the month, marked correctly', () => {
  const heatmap = buildMonthlyHeatmap(['2026-09-05', '2026-09-06'], '2026-09');
  assert.equal(heatmap.length, 30);
  assert.equal(heatmap[0].date, '2026-09-01');
  assert.equal(heatmap[29].date, '2026-09-30');
  assert.equal(heatmap.find((d) => d.date === '2026-09-05')?.hasWorkout, true);
  assert.equal(heatmap.find((d) => d.date === '2026-09-10')?.hasWorkout, false);
});

test('monthly heatmap handles February correctly', () => {
  assert.equal(buildMonthlyHeatmap([], '2026-02').length, 28);
});

const sets = (reps: number, weight: number) => [{ reps, weight }];
const log = (date: string, exerciseId: string, name: string, reps: number, weight: number) => ({
  date,
  state: 'completed',
  exercises: [{ exerciseId, name, sets: sets(reps, weight) }],
});

test('the first time an exercise is logged is not a PR', () => {
  const records = detectPersonalRecords([log('2026-09-01', 'bench', 'Bench Press', 8, 60)]);
  assert.equal(records.length, 0);
});

test('a heavier session than any before it is a PR', () => {
  const records = detectPersonalRecords([
    log('2026-09-01', 'bench', 'Bench Press', 8, 60),
    log('2026-09-08', 'bench', 'Bench Press', 8, 65),
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].exerciseId, 'bench');
  assert.equal(records[0].previousBest, 60 * (1 + 8 / 30));
  assert.ok(records[0].improvementPercent! > 0);
});

test('a lighter or equal session is not a PR', () => {
  const records = detectPersonalRecords([
    log('2026-09-01', 'bench', 'Bench Press', 8, 65),
    log('2026-09-08', 'bench', 'Bench Press', 8, 60),
    log('2026-09-15', 'bench', 'Bench Press', 8, 65),
  ]);
  assert.equal(records.length, 0);
});

test('planned rows and empty sets are ignored', () => {
  const records = detectPersonalRecords([
    { date: '2026-09-01', state: 'planned', exercises: [{ exerciseId: 'bench', name: 'Bench', sets: sets(8, 60) }] },
    { date: '2026-09-08', state: 'completed', exercises: [{ exerciseId: 'bench', name: 'Bench', sets: [{ reps: 0, weight: 0 }] }] },
  ]);
  assert.equal(records.length, 0);
});

test('records come back newest first', () => {
  const records = detectPersonalRecords([
    log('2026-09-01', 'bench', 'Bench Press', 8, 60),
    log('2026-09-08', 'bench', 'Bench Press', 8, 65),
    log('2026-09-15', 'bench', 'Bench Press', 8, 70),
  ]);
  assert.equal(records.length, 2);
  assert.equal(records[0].date, '2026-09-15');
  assert.equal(records[1].date, '2026-09-08');
});

test('different exercises track independent bests', () => {
  const records = detectPersonalRecords([
    log('2026-09-01', 'bench', 'Bench Press', 8, 60),
    log('2026-09-01', 'squat', 'Squat', 5, 100),
    log('2026-09-08', 'bench', 'Bench Press', 8, 62),
    log('2026-09-08', 'squat', 'Squat', 5, 90), // lighter — not a PR
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].exerciseId, 'bench');
});
