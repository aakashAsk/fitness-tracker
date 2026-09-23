import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeSession,
  elapsedSeconds,
  encodeSession,
  formatElapsed,
  type ActiveSession,
} from '../sessionTimer.ts';

const session: ActiveSession = {
  kind: 'workout',
  planId: 'plan-1',
  title: 'Push Day',
  dateKey: '2026-09-21',
  startedAt: 1_000_000,
};

test('elapsedSeconds counts whole seconds since the start', () => {
  assert.equal(elapsedSeconds(1_000_000, 1_000_000), 0);
  assert.equal(elapsedSeconds(1_000_000, 1_000_999), 0);
  assert.equal(elapsedSeconds(1_000_000, 1_001_000), 1);
  assert.equal(elapsedSeconds(1_000_000, 1_000_000 + 65_000), 65);
});

test('elapsedSeconds never goes negative if the clock moved back', () => {
  assert.equal(elapsedSeconds(2_000_000, 1_000_000), 0);
});

test('formatElapsed shows m:ss under an hour', () => {
  assert.equal(formatElapsed(0), '0:00');
  assert.equal(formatElapsed(7), '0:07');
  assert.equal(formatElapsed(247), '4:07');
  assert.equal(formatElapsed(3599), '59:59');
});

test('formatElapsed shows h:mm:ss from an hour up', () => {
  assert.equal(formatElapsed(3600), '1:00:00');
  assert.equal(formatElapsed(3729), '1:02:09');
});

test('a session survives an encode/decode round trip', () => {
  assert.deepEqual(decodeSession(encodeSession(session)), session);
});

test('decodeSession returns null for missing, corrupt or malformed input', () => {
  assert.equal(decodeSession(null), null);
  assert.equal(decodeSession(''), null);
  assert.equal(decodeSession('{oops'), null);
  assert.equal(decodeSession('null'), null);
  assert.equal(decodeSession(JSON.stringify({ ...session, kind: 'run' })), null);
  assert.equal(decodeSession(JSON.stringify({ ...session, planId: '' })), null);
  assert.equal(decodeSession(JSON.stringify({ ...session, startedAt: 'now' })), null);
});
