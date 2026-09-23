import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_FLAGS } from '../registry.ts';
import { findStaleFlags } from '../staleness.ts';
import type { FlagDefinition } from '../types.ts';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const entries: [string, FlagDefinition][] = Object.entries(FEATURE_FLAGS);

test('every registry entry key matches its property name', () => {
  for (const [name, def] of entries) assert.equal(def.key, name);
});

test('a closed flag never has a default of true', () => {
  for (const [, def] of entries) {
    if (def.failMode === 'closed') assert.equal(def.defaultValue, false, def.key);
  }
});

test('dates are YYYY-MM-DD and removal is after creation', () => {
  for (const [, def] of entries) {
    assert.match(def.createdAt, ISO, def.key);
    assert.match(def.plannedRemoval, ISO, def.key);
    assert.ok(def.plannedRemoval > def.createdAt, def.key);
  }
});

test('every flag has an owner and a description', () => {
  for (const [, def] of entries) {
    assert.ok(def.owner.length > 0, def.key);
    assert.ok(def.description.length > 0, def.key);
  }
});

// The reminder that cannot be ignored: delete the flag (and its gate)
// once the rollout is done. 30 days of grace so it does not fire on the
// removal day itself.
test('no flag is more than 30 days past its planned removal', () => {
  const today = new Date().toISOString().slice(0, 10);
  const worst = findStaleFlags(FEATURE_FLAGS, today).filter(f => f.daysOverdue > 30);
  assert.deepEqual(
    worst,
    [],
    `Remove these flags from the registry and code: ${worst.map(f => f.key).join(', ')}`,
  );
});
