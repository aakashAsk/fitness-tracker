import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateOneRepMax } from '../progressService.ts';

test('estimateOneRepMax returns 0 for a non-positive weight', () => {
  assert.equal(estimateOneRepMax({ weight: 0, reps: 10 }), 0);
  assert.equal(estimateOneRepMax({ weight: -5, reps: 10 }), 0);
});

test('estimateOneRepMax returns the weight unchanged for reps <= 1', () => {
  assert.equal(estimateOneRepMax({ weight: 60, reps: 1 }), 60);
  assert.equal(estimateOneRepMax({ weight: 60, reps: 0 }), 60);
});

test('estimateOneRepMax applies the Epley formula for reps > 1', () => {
  // 60 * (1 + 10/30) = 80
  assert.equal(estimateOneRepMax({ weight: 60, reps: 10 }), 80);
});
