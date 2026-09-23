import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daySpan, daysBetween, lastNDays, weekWindow } from '../dateRange.ts';

test('weekWindow(0) runs from Monday to the reference day', () => {
  // 2026-09-23 is a Wednesday.
  const wednesday = new Date('2026-09-23T12:00:00');
  assert.deepEqual(weekWindow(wednesday, 0), { startKey: '2026-09-21', endKey: '2026-09-23' });
});

test('weekWindow(-1) is the full seven days of the prior week', () => {
  const wednesday = new Date('2026-09-23T12:00:00');
  assert.deepEqual(weekWindow(wednesday, -1), { startKey: '2026-09-14', endKey: '2026-09-20' });
});

test('weekWindow treats Sunday as the last day of its own week', () => {
  const sunday = new Date('2026-09-27T00:00:00');
  assert.deepEqual(weekWindow(sunday, 0), { startKey: '2026-09-21', endKey: '2026-09-27' });
});

test('lastNDays returns count days ending on the reference, oldest first', () => {
  const days = lastNDays(new Date('2026-09-23T00:00:00'), 3);
  assert.deepEqual(days, ['2026-09-21', '2026-09-22', '2026-09-23']);
});

test('daysBetween is inclusive of both ends', () => {
  assert.deepEqual(daysBetween('2026-09-01', '2026-09-03'), [
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
  ]);
});

test('daysBetween handles a single-day range', () => {
  assert.deepEqual(daysBetween('2026-09-01', '2026-09-01'), ['2026-09-01']);
});

test('daySpan is positive when the end is later, negative otherwise', () => {
  assert.equal(daySpan('2026-09-01', '2026-09-08'), 7);
  assert.equal(daySpan('2026-09-08', '2026-09-01'), -7);
  assert.equal(daySpan('2026-09-01', '2026-09-01'), 0);
});

test('addDays moves forward and backward across month boundaries', () => {
  assert.equal(addDays(new Date('2026-09-30T00:00:00'), 1).getDate(), 1);
  assert.equal(addDays(new Date('2026-09-01T00:00:00'), -1).getDate(), 31);
});
