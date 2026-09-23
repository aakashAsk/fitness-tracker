import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCache, decodeCache } from '../flagCacheCodec.ts';

test('round trip preserves values', () => {
  assert.deepEqual(decodeCache(encodeCache({ a: true, b: false })), { a: true, b: false });
});

test('null, undefined and empty string decode to null', () => {
  assert.equal(decodeCache(null), null);
  assert.equal(decodeCache(undefined), null);
  assert.equal(decodeCache(''), null);
});

test('corrupt JSON decodes to null and does not throw', () => {
  assert.equal(decodeCache('{not json'), null);
});

test('unknown cache version decodes to null', () => {
  assert.equal(decodeCache(JSON.stringify({ v: 99, flags: { a: true } })), null);
});

test('missing or non-object flags decode to null', () => {
  assert.equal(decodeCache(JSON.stringify({ v: 1 })), null);
  assert.equal(decodeCache(JSON.stringify({ v: 1, flags: 'x' })), null);
  assert.equal(decodeCache('null'), null);
});

test('non-boolean values are dropped', () => {
  assert.deepEqual(decodeCache(JSON.stringify({ v: 1, flags: { a: true, b: 'yes', c: 1 } })), {
    a: true,
  });
});
