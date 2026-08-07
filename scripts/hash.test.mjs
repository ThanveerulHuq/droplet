import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex } from '../src/lib/hash.ts';

test('sha256Hex is deterministic and returns 16 lowercase hex chars', async () => {
  const a = await sha256Hex('abc');
  const b = await sha256Hex('abc');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{16}$/);
});

test('different inputs produce different hashes', async () => {
  const a = await sha256Hex('abc');
  const b = await sha256Hex('abd');
  assert.notEqual(a, b);
});

test('sha256Hex with len 64 returns the full SHA-256 hex digest', async () => {
  const out = await sha256Hex('abc', 64);
  assert.match(out, /^[0-9a-f]{64}$/);
});
