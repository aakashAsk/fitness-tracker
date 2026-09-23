import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findStaleFlags } from '../staleness.ts';
import type { FlagDefinition } from '../types.ts';

const flag = (key: string, plannedRemoval: string): FlagDefinition => ({
  key,
  description: 'x',
  owner: 'o',
  defaultValue: false,
  createdAt: '2026-01-01',
  plannedRemoval,
  failMode: 'closed',
});

test('nothing is stale before the removal date', () => {
  assert.deepEqual(findStaleFlags({ a: flag('a', '2026-06-01') }, '2026-05-31'), []);
});

test('a flag is not stale on the removal date itself', () => {
  assert.deepEqual(findStaleFlags({ a: flag('a', '2026-06-01') }, '2026-06-01'), []);
});

test('a flag is stale the day after, with days overdue', () => {
  const out = findStaleFlags({ a: flag('a', '2026-06-01') }, '2026-06-02');
  assert.equal(out.length, 1);
  assert.equal(out[0].key, 'a');
  assert.equal(out[0].daysOverdue, 1);
});

test('only overdue flags are returned', () => {
  const out = findStaleFlags(
    { a: flag('a', '2026-01-01'), b: flag('b', '2027-01-01') },
    '2026-03-01',
  );
  assert.deepEqual(out.map(f => f.key), ['a']);
  assert.equal(out[0].daysOverdue, 59);
});

test('empty registry has no stale flags', () => {
  assert.deepEqual(findStaleFlags({}, '2026-03-01'), []);
});
