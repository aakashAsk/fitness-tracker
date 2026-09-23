import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCalorieAdherence,
  computePlanAdherence,
  computeProteinAdherence,
} from '../adherenceService.ts';

test('calorie adherence: within tolerance counts as a hit', () => {
  const result = computeCalorieAdherence(
    [
      { date: '1', consumedCalories: 2000 }, // exact
      { date: '2', consumedCalories: 2150 }, // +7.5%, within 10%
      { date: '3', consumedCalories: 2300 }, // +15%, outside 10%
    ],
    2000,
  );
  assert.equal(result.hitDays, 2);
  assert.equal(result.totalDays, 3);
  assert.equal(result.percent, 67);
});

test('calorie adherence: a day with nothing logged is a miss, not skipped', () => {
  const result = computeCalorieAdherence(
    [
      { date: '1', consumedCalories: 2000 },
      { date: '2', consumedCalories: null },
    ],
    2000,
  );
  assert.equal(result.hitDays, 1);
  assert.equal(result.totalDays, 2);
  assert.equal(result.percent, 50);
});

test('calorie adherence: no days or no target is null, not 0%', () => {
  assert.equal(computeCalorieAdherence([], 2000).percent, null);
  assert.equal(computeCalorieAdherence([{ date: '1', consumedCalories: 2000 }], 0).percent, null);
});

test('protein adherence: a floor, not a band — exceeding the target still hits', () => {
  const result = computeProteinAdherence(
    [
      { date: '1', consumedProtein: 150 }, // exactly the target
      { date: '2', consumedProtein: 400 }, // far over — still a hit
      { date: '3', consumedProtein: 100 }, // under 90% of 150 (135) — a miss
    ],
    150,
  );
  assert.equal(result.hitDays, 2);
  assert.equal(result.totalDays, 3);
});

test('protein adherence: the tolerance is a floor below the target, by default 90%', () => {
  const result = computeProteinAdherence([{ date: '1', consumedProtein: 136 }], 150);
  assert.equal(result.hitDays, 1); // 136 >= 150*0.9 = 135
});

test('plan adherence: percent of planned sessions completed', () => {
  const result = computePlanAdherence(10, 7);
  assert.equal(result.percent, 70);
  assert.equal(result.hitDays, 7);
  assert.equal(result.totalDays, 10);
});

test('plan adherence: nothing planned is null, not 0% or 100%', () => {
  assert.equal(computePlanAdherence(0, 0).percent, null);
});

test('plan adherence: extra unplanned sessions do not push past 100%', () => {
  const result = computePlanAdherence(5, 8);
  assert.equal(result.percent, 100);
  assert.equal(result.hitDays, 5);
});
