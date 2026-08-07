import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore } from '../src/storage/schema.ts';
import { applyTurn } from '../src/storage/ingest.ts';

const sample = (over = {}) => ({ turnKey: 'k1', charCount: 1200, isReasoning: false, provider: 'chatgpt', ...over });

test('increments the day bucket and returns accepted', () => {
  const store = emptyStore();
  const r = applyTurn(store, sample(), new Date('2026-08-07T12:00:00').getTime());
  assert.equal(r.accepted, true);
  assert.equal(store.days['2026-08-07'].chatgpt.turns, 1);
  assert.equal(store.days['2026-08-07'].chatgpt.tokensOut, 300); // 1200/4
  assert.equal(r.store, store);
});
test('dedupes identical turnKeys', () => {
  const store = emptyStore();
  applyTurn(store, sample(), new Date('2026-08-07T12:00:00').getTime());
  const r = applyTurn(store, sample(), new Date('2026-08-07T12:00:01').getTime());
  assert.equal(r.accepted, false);
  assert.equal(store.days['2026-08-07'].chatgpt.turns, 1);
});
test('charCount -1 is marked estimated and uses median tokens', () => {
  const store = emptyStore();
  applyTurn(store, sample({ turnKey: 'k2', charCount: -1 }), new Date('2026-08-07T12:00:00').getTime());
  const c = store.days['2026-08-07'].chatgpt;
  assert.equal(c.estimatedTurns, 1);
  assert.equal(c.tokensOut, 75); // MEDIAN_RESPONSE_TOKENS
});
test('reasoning turns increment reasoningTurns', () => {
  const store = emptyStore();
  applyTurn(store, sample({ turnKey: 'k3', isReasoning: true }), new Date('2026-08-07T12:00:00').getTime());
  assert.equal(store.days['2026-08-07'].chatgpt.reasoningTurns, 1);
});
test('updates the conversation bucket and lastSeen', () => {
  const store = emptyStore();
  store.chats['abc'] = { provider: 'chatgpt', firstSeen: 1, lastSeen: 1, counters: { turns: 0, tokensOut: 0, reasoningTurns: 0, estimatedTurns: 0 } };
  applyTurn(store, sample({ chatKey: 'abc' }), 5000);
  assert.equal(store.chats['abc'].counters.turns, 1);
  assert.equal(store.chats['abc'].lastSeen, 5000);
});
test('creates a fresh chat entry on first turn', () => {
  const store = emptyStore();
  const now = 5000;
  const r = applyTurn(store, sample({ turnKey: 'k-fresh', chatKey: 'fresh' }), now);
  assert.equal(r.accepted, true);
  assert.deepEqual(store.chats['fresh'], {
    provider: 'chatgpt',
    firstSeen: now,
    lastSeen: now,
    counters: { turns: 1, tokensOut: 300, reasoningTurns: 0, estimatedTurns: 0 },
  });
});
test('seen ring is capped at SEEN_CAP', () => {
  const store = emptyStore();
  for (let i = 0; i < 501; i++) applyTurn(store, sample({ turnKey: `k${i}`, chatKey: 'x' }), 1000 + i);
  assert.equal(store.seen.length, 500);
});
test('a turn that was evicted from the ring is counted again', () => {
  const store = emptyStore();
  for (let i = 0; i < 501; i++) applyTurn(store, sample({ turnKey: `k${i}`, chatKey: 'x' }), 1000 + i);
  const r = applyTurn(store, sample({ turnKey: 'k0' }), 2000); // evicted earlier
  assert.equal(r.accepted, true);
});
