import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, emptyCounters } from '../src/storage/schema.ts';
import { toDateKey } from '../src/storage/ingest.ts';
import { scopeCounters, estimatedRatio } from '../src/model/aggregate.ts';

const NOON = new Date('2026-08-08T12:00:00').getTime();
const VAL = { turns: 2, tokensOut: 100, reasoningTurns: 1, estimatedTurns: 0 };

function storeWithDays(keys, value = VAL) {
  const store = emptyStore();
  for (const k of keys) store.days[k] = { chatgpt: { ...value } };
  return store;
}

test('scopeCounters: week sums the last 7 local day buckets inclusive of today', () => {
  const keys = [];
  for (let i = 0; i <= 7; i++) keys.push(toDateKey(NOON - i * 86400000));
  const store = storeWithDays(keys);
  const c = scopeCounters(store, 'week', null, NOON);
  assert.deepEqual(c, {
    turns: 14, tokensOut: 700, reasoningTurns: 7, estimatedTurns: 0, // 7 x VAL
  });
});

test('scopeCounters: empty store returns zeroed today counters, not null', () => {
  assert.deepEqual(scopeCounters(emptyStore(), 'today', null, NOON), emptyCounters());
});

test('scopeCounters: today with a day bucket that has no providers returns zeroed', () => {
  const store = emptyStore();
  store.days[toDateKey(NOON)] = {};
  assert.deepEqual(scopeCounters(store, 'today', null, NOON), emptyCounters());
});

test('scopeCounters: today sums all providers in the day bucket', () => {
  const store = emptyStore();
  store.days[toDateKey(NOON)] = {
    chatgpt: { turns: 1, tokensOut: 50, reasoningTurns: 0, estimatedTurns: 1 },
    'some-other-provider': { turns: 3, tokensOut: 150, reasoningTurns: 2, estimatedTurns: 0 },
  };
  assert.deepEqual(scopeCounters(store, 'today', null, NOON), {
    turns: 4, tokensOut: 200, reasoningTurns: 2, estimatedTurns: 1,
  });
});

test('scopeCounters: month sums the last 30 local day buckets', () => {
  const keys = [];
  for (let i = 0; i < 30; i++) keys.push(toDateKey(NOON - i * 86400000));
  const store = storeWithDays(keys);
  const c = scopeCounters(store, 'month', null, NOON);
  assert.deepEqual(c, {
    turns: 60, tokensOut: 3000, reasoningTurns: 30, estimatedTurns: 0, // 30 x VAL
  });
});

test('scopeCounters: all sums every day bucket in the store', () => {
  const store = emptyStore();
  store.days['2026-08-08'] = { chatgpt: { turns: 1, tokensOut: 10, reasoningTurns: 0, estimatedTurns: 0 } };
  store.days['2026-06-01'] = { chatgpt: { turns: 5, tokensOut: 50, reasoningTurns: 5, estimatedTurns: 0 } };
  store.days['2025-01-01'] = { chatgpt: { turns: 2, tokensOut: 40, reasoningTurns: 0, estimatedTurns: 2 } };
  assert.deepEqual(scopeCounters(store, 'all', null, NOON), {
    turns: 8, tokensOut: 100, reasoningTurns: 5, estimatedTurns: 2,
  });
});

test('scopeCounters: all on an empty store returns zeroed', () => {
  assert.deepEqual(scopeCounters(emptyStore(), 'all', null, NOON), emptyCounters());
});

test('scopeCounters: chat returns the chat counters when chatKey is present', () => {
  const store = emptyStore();
  store.chats['abc'] = { provider: 'chatgpt', firstSeen: 1, lastSeen: 1, counters: { ...VAL } };
  assert.deepEqual(scopeCounters(store, 'chat', 'abc', NOON), VAL);
});

test('scopeCounters: chat returns null when chatKey is null', () => {
  assert.equal(scopeCounters(emptyStore(), 'chat', null, NOON), null);
});

test('scopeCounters: chat returns null when chatKey is missing', () => {
  assert.equal(scopeCounters(emptyStore(), 'chat', 'missing', NOON), null);
});

test('estimatedRatio: estimatedTurns / turns when turns > 0', () => {
  assert.equal(estimatedRatio({ turns: 100, tokensOut: 0, reasoningTurns: 0, estimatedTurns: 10 }), 0.1);
});

test('estimatedRatio: zero when turns is zero', () => {
  assert.equal(estimatedRatio(emptyCounters()), 0);
});
