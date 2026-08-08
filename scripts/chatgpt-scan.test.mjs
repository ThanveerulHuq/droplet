import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateScan } from '../src/adapters/chatgpt.ts';

test('aggregateScan: sums lengths and counts reasoning nodes', () => {
  const nodes = [
    { length: 1200, hasReasoning: false },
    { length: 600, hasReasoning: true },
  ];
  assert.deepEqual(aggregateScan(nodes), { turnCount: 2, totalChars: 1800, reasoningCount: 1 });
});

test('aggregateScan: empty node list returns null', () => {
  assert.equal(aggregateScan([]), null);
});

test('aggregateScan: zero-length node still counts as a turn', () => {
  assert.deepEqual(aggregateScan([{ length: 0, hasReasoning: false }]), { turnCount: 1, totalChars: 0, reasoningCount: 0 });
});
