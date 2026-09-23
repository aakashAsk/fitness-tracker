import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFlag, resolveAll } from '../resolveFlag.ts';
import type { FlagDefinition } from '../types.ts';

const base = {
  description: 'x',
  owner: 'o',
  createdAt: '2026-01-01',
  plannedRemoval: '2026-06-01',
} as const;

const open: FlagDefinition = { ...base, key: 'a', defaultValue: true, failMode: 'open' };
const closed: FlagDefinition = { ...base, key: 'b', defaultValue: false, failMode: 'closed' };

test('server value wins over cache and default', () => {
  assert.deepEqual(resolveFlag(open, { a: false }, { a: true }), { enabled: false, source: 'server' });
});

test('cache is used when the server has no value for the key', () => {
  assert.deepEqual(resolveFlag(open, {}, { a: false }), { enabled: false, source: 'cache' });
  assert.deepEqual(resolveFlag(open, null, { a: false }), { enabled: false, source: 'cache' });
});

test('default is used when neither server nor cache has a value', () => {
  assert.deepEqual(resolveFlag(open, null, null), { enabled: true, source: 'default' });
  assert.deepEqual(resolveFlag(open, undefined, undefined), { enabled: true, source: 'default' });
});

test('closed flag with no value anywhere is OFF', () => {
  assert.deepEqual(resolveFlag(closed, null, null), { enabled: false, source: 'default' });
});

test('closed flag is OFF even if a misconfigured default says true', () => {
  const sloppy: FlagDefinition = { ...closed, defaultValue: true };
  assert.equal(resolveFlag(sloppy, null, null).enabled, false);
});

test('a closed flag can still be switched ON by the server', () => {
  assert.equal(resolveFlag(closed, { b: true }, null).enabled, true);
});

test('non-boolean values are ignored and fall through', () => {
  const bad = { a: 'yes' } as unknown as Record<string, boolean>;
  assert.deepEqual(resolveFlag(open, bad, { a: false }), { enabled: false, source: 'cache' });
});

test('unknown keys in the database are ignored by resolveAll', () => {
  const out = resolveAll({ a: open }, { a: false, ghost: true }, null);
  assert.deepEqual(Object.keys(out), ['a']);
  assert.equal(out.a.enabled, false);
});

test('resolveAll resolves each flag independently', () => {
  const out = resolveAll({ a: open, b: closed }, { b: true }, { a: false });
  assert.deepEqual(out.a, { enabled: false, source: 'cache' });
  assert.deepEqual(out.b, { enabled: true, source: 'server' });
});
