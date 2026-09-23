import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFlagsReady,
  getResolvedFlags,
  isFeatureEnabled,
  markFlagsReady,
  resetFlagStoreForTests,
  setCachedFlags,
  setServerFlags,
  subscribeToFlagStore,
} from '../flagStore.ts';
import { FEATURE_FLAGS } from '../registry.ts';

// disabledPushNotification is a kill switch: true = notifications OFF.
const KEY = 'disabledPushNotification';

beforeEach(() => resetFlagStoreForTests());

test('before anything loads, the default applies: kill switch off, notifications on', () => {
  assert.equal(isFeatureEnabled(KEY), false);
  assert.equal(getResolvedFlags()[KEY].source, 'default');
  assert.equal(getFlagsReady(), false);
});

test('a cached kill is honoured until the server answers', () => {
  setCachedFlags({ [KEY]: true });
  assert.equal(isFeatureEnabled(KEY), true);
  assert.equal(getResolvedFlags()[KEY].source, 'cache');
});

test('the server overrides the cache, live', () => {
  setCachedFlags({ [KEY]: true });
  setServerFlags({ [KEY]: false });
  assert.equal(isFeatureEnabled(KEY), false);
  assert.equal(getResolvedFlags()[KEY].source, 'server');
});

test('flipping the server value on and off is reflected immediately', () => {
  setServerFlags({ [KEY]: true });
  assert.equal(isFeatureEnabled(KEY), true);
  setServerFlags({ [KEY]: false });
  assert.equal(isFeatureEnabled(KEY), false);
});

test('a flag document deleted on the server reverts to default, not the stale cached kill', () => {
  setCachedFlags({ [KEY]: true });
  setServerFlags({});
  assert.equal(isFeatureEnabled(KEY), false);
  assert.equal(getResolvedFlags()[KEY].source, 'default');
});

test('a late cache read cannot override a server value', () => {
  setServerFlags({ [KEY]: false });
  setCachedFlags({ [KEY]: true });
  assert.equal(isFeatureEnabled(KEY), false);
});

test('unknown keys from the server are ignored', () => {
  setServerFlags({ somethingElse: true });
  assert.equal(isFeatureEnabled(KEY), false);
  // The resolved set is exactly the registry — no more, no less. Compared
  // against the registry rather than a hardcoded list, so adding a flag
  // does not fail a test that is about unknown keys.
  const resolved = Object.keys(getResolvedFlags()).sort();
  assert.equal(resolved.includes('somethingElse'), false);
  assert.deepEqual(resolved, Object.keys(FEATURE_FLAGS).sort());
});

test('subscribers are notified on change and can unsubscribe', () => {
  let calls = 0;
  const unsubscribe = subscribeToFlagStore(() => {
    calls += 1;
  });
  setServerFlags({ [KEY]: true });
  assert.equal(calls, 1);
  unsubscribe();
  setServerFlags({ [KEY]: false });
  assert.equal(calls, 1);
});

test('ready latches and does not flip back', () => {
  markFlagsReady();
  assert.equal(getFlagsReady(), true);
  markFlagsReady();
  assert.equal(getFlagsReady(), true);
});
