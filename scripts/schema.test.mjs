import test from 'node:test';
import assert from 'node:assert/strict';
import { addCounters, emptyCounters, DEFAULT_SETTINGS, SEEN_CAP } from '../src/storage/schema.ts';

test('emptyCounters is all zeroes', () => {
  assert.deepEqual(emptyCounters(), { turns: 0, tokensOut: 0, reasoningTurns: 0, estimatedTurns: 0 });
});
test('addCounters sums each field', () => {
  const a = { turns: 1, tokensOut: 75, reasoningTurns: 1, estimatedTurns: 0 };
  const b = { turns: 2, tokensOut: 150, reasoningTurns: 0, estimatedTurns: 1 };
  assert.deepEqual(addCounters(a, b), { turns: 3, tokensOut: 225, reasoningTurns: 1, estimatedTurns: 1 });
});
test('defaults match PRD §5.3', () => {
  assert.equal(DEFAULT_SETTINGS.accountingMode, 'total');
  assert.equal(DEFAULT_SETTINGS.energyTier, 'mid');
  assert.equal(DEFAULT_SETTINGS.wue, 'fleet');
  assert.equal(DEFAULT_SETTINGS.units, 'auto');
  assert.equal(DEFAULT_SETTINGS.comparisonSet, 'everyday');
  assert.equal(DEFAULT_SETTINGS.tracking, true);
});
test('SEEN_CAP is 500', () => { assert.equal(SEEN_CAP, 500); });
