import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeMissingTarget,
  describePlanSummary,
  isRestCategory,
  isTargetCategory,
  MAX_TARGET_KM,
  MAX_TARGET_MINUTES,
  parseTarget,
  PLAN_CATEGORIES,
  toPlanCategory,
  usesDistanceTarget,
} from '../planCategory.ts';

test('cardio, cycling, walking and swimming are target categories', () => {
  for (const category of ['cardio', 'cycling', 'walking', 'swimming'] as const) {
    assert.equal(isTargetCategory(category), true, category);
  }
});

test('workout and cross-fit keep the exercise-based form', () => {
  for (const category of ['workout', 'cross-fit'] as const) {
    assert.equal(isTargetCategory(category), false, category);
  }
  assert.equal(isTargetCategory(undefined), false);
});

test('only cardio, cycling and walking have a distance target; swimming is time only', () => {
  assert.equal(usesDistanceTarget('cardio'), true);
  assert.equal(usesDistanceTarget('cycling'), true);
  assert.equal(usesDistanceTarget('walking'), true);
  assert.equal(usesDistanceTarget('swimming'), false);
  assert.equal(usesDistanceTarget('workout'), false);
  assert.equal(usesDistanceTarget(undefined), false);
});

test('"other" is no longer a category', () => {
  assert.equal(PLAN_CATEGORIES.some(entry => entry.key === ('other' as string)), false);
  assert.equal(toPlanCategory('other'), undefined);
});

test('toPlanCategory accepts known keys and rejects everything else', () => {
  assert.equal(toPlanCategory('cycling'), 'cycling');
  assert.equal(toPlanCategory('swimming'), 'swimming');
  assert.equal(toPlanCategory('yoga'), undefined);
  assert.equal(toPlanCategory(undefined), undefined);
  assert.equal(toPlanCategory(5), undefined);
});

test('parseTarget reads positive numbers, including a decimal comma', () => {
  assert.equal(parseTarget('5', MAX_TARGET_KM), 5);
  assert.equal(parseTarget(' 12.5 ', MAX_TARGET_KM), 12.5);
  assert.equal(parseTarget('5,5', MAX_TARGET_KM), 5.5);
  assert.equal(parseTarget('30', MAX_TARGET_MINUTES), 30);
});

test('parseTarget rounds to two decimals', () => {
  assert.equal(parseTarget('3.14159', MAX_TARGET_KM), 3.14);
});

test('parseTarget rejects empty, zero, negative, text and over-limit values', () => {
  assert.equal(parseTarget('', MAX_TARGET_KM), undefined);
  assert.equal(parseTarget('0', MAX_TARGET_KM), undefined);
  assert.equal(parseTarget('-3', MAX_TARGET_KM), undefined);
  assert.equal(parseTarget('abc', MAX_TARGET_KM), undefined);
  assert.equal(parseTarget('501', MAX_TARGET_KM), undefined);
  assert.equal(parseTarget('1441', MAX_TARGET_MINUTES), undefined);
});

test('cardio, cycling and walking need a distance or a time', () => {
  for (const category of ['cardio', 'cycling', 'walking'] as const) {
    assert.notEqual(describeMissingTarget(category, undefined, undefined), null, category);
    assert.equal(describeMissingTarget(category, 5, undefined), null, category);
    assert.equal(describeMissingTarget(category, undefined, 30), null, category);
    assert.equal(describeMissingTarget(category, 5, 30), null, category);
  }
});

test('swimming needs a time, and a distance alone does not count', () => {
  assert.notEqual(describeMissingTarget('swimming', undefined, undefined), null);
  assert.notEqual(describeMissingTarget('swimming', 2, undefined), null);
  assert.equal(describeMissingTarget('swimming', undefined, 45), null);
});

test('a rest day is its own category, not a target or exercise plan', () => {
  assert.equal(isRestCategory('rest'), true);
  assert.equal(isRestCategory('workout'), false);
  assert.equal(isRestCategory(undefined), false);
  assert.equal(isTargetCategory('rest'), false);
  assert.equal(usesDistanceTarget('rest'), false);
  assert.equal(toPlanCategory('rest'), 'rest');
});

test('describePlanSummary reads each kind of plan', () => {
  assert.equal(describePlanSummary({ category: 'rest', exerciseIds: [] }), 'Rest day');
  assert.equal(
    describePlanSummary({ category: 'swimming', exerciseIds: [], targetMinutes: 45 }),
    '45 min in the pool',
  );
  assert.equal(
    describePlanSummary({ category: 'cycling', exerciseIds: [], targetKm: 20, targetMinutes: 60 }),
    '20 km · 60 min',
  );
  assert.equal(describePlanSummary({ category: 'walking', exerciseIds: [], targetKm: 5 }), '5 km');
  assert.equal(describePlanSummary({ category: 'cardio', exerciseIds: [] }), 'No target set');
  assert.equal(describePlanSummary({ category: 'workout', exerciseIds: ['a', 'b', 'c'] }), '3 exercises');
  assert.equal(describePlanSummary({ exerciseIds: ['a'] }), '1 exercise');
});
