import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, DEFAULT_SETTINGS } from '../src/storage/schema.ts';
import { toDateKey } from '../src/storage/ingest.ts';
import { buildScopeView } from '../src/model/popup.ts';

const NOON = new Date('2026-08-08T12:00:00').getTime();

// Hand-computed band: turns=10000, tokensOut=750000, reasoningTurns=0 with
// mid tier (whBase 0.05, whPerToken 0.00063) and fleet WUE (wueDc 1.1, ewifGrid 4.5):
//   energyWh = (10000*0.05 + 750000*0.00063) = 500 + 472.5 = 972.5 Wh
//   waterMl  = 972.5*1.1 + 972.5*4.5 = 5446 mL
const BIG = { turns: 10000, tokensOut: 750000, reasoningTurns: 0, estimatedTurns: 0 };

function everydayStore() {
  const store = emptyStore();
  store.settings = { ...DEFAULT_SETTINGS, units: 'metric', comparisonSet: 'everyday' };
  store.days[toDateKey(NOON)] = { chatgpt: { ...BIG } };
  return store;
}

test('buildScopeView: known store maps to a hand-computed mid band and comparison label', () => {
  const view = buildScopeView(everydayStore(), everydayStore().settings, 'today', null, NOON);
  assert.equal(view.band.mid, 5446);
  assert.equal(view.primary.rung.name, 'water bottle');
  assert.equal(view.primary.multiple, 5446 / 500);
  assert.equal(view.primary.label, '11 water bottles');
});

test('buildScopeView: primary label matches formatComparison for the mid band', () => {
  const store = everydayStore();
  const view = buildScopeView(store, store.settings, 'today', null, NOON);
  assert.equal(view.primary.label, '11 water bottles');
});

test('buildScopeView: empty chat scope returns null', () => {
  const store = everydayStore();
  assert.equal(buildScopeView(store, store.settings, 'chat', null, NOON), null);
  assert.equal(buildScopeView(store, store.settings, 'chat', 'missing', NOON), null);
});

test('buildScopeView: secondary is null when comparisonSet is food', () => {
  const store = everydayStore();
  store.settings.comparisonSet = 'food';
  const view = buildScopeView(store, store.settings, 'today', null, NOON);
  assert.equal(view.secondary, null);
  assert.equal(view.primary.rung.name, 'almond');
  assert.equal(view.primary.label, '≈1.4 almonds');
});

test('buildScopeView: secondary holds the food comparison when comparisonSet is everyday', () => {
  const store = everydayStore();
  const view = buildScopeView(store, store.settings, 'today', null, NOON);
  assert.ok(view.secondary);
  assert.equal(view.secondary.rung.name, 'almond');
  assert.equal(view.secondary.label, '≈1.4 almonds');
});

test('buildScopeView: provider is the chat provider for chat scope', () => {
  const store = everydayStore();
  store.chats['abc'] = { provider: 'chatgpt', firstSeen: 1, lastSeen: 1, counters: { ...BIG } };
  const view = buildScopeView(store, store.settings, 'chat', 'abc', NOON);
  assert.deepEqual(view.provider, ['chatgpt']);
});

test('buildScopeView: provider gathers distinct day providers in insertion order', () => {
  const store = everydayStore();
  store.days[toDateKey(NOON)] = {
    chatgpt: { ...BIG },
    'some-other-provider': { turns: 1, tokensOut: 10, reasoningTurns: 0, estimatedTurns: 0 },
  };
  const view = buildScopeView(store, store.settings, 'today', null, NOON);
  assert.deepEqual(view.provider, ['chatgpt', 'some-other-provider']);
});

test('buildScopeView: provider is unique across summed day buckets', () => {
  const store = everydayStore();
  store.days[toDateKey(NOON)] = { chatgpt: { ...BIG } };
  store.days[toDateKey(NOON - 86400000)] = { chatgpt: { ...BIG } };
  const view = buildScopeView(store, store.settings, 'all', null, NOON);
  assert.deepEqual(view.provider, ['chatgpt']);
});

test('buildScopeView: provider is empty when no day data exists', () => {
  const store = everydayStore();
  store.days = {};
  const view = buildScopeView(store, store.settings, 'today', null, NOON);
  assert.deepEqual(view.provider, []);
});

test('buildScopeView: estimatedRatio is propagated', () => {
  const store = everydayStore();
  store.days[toDateKey(NOON)] = { chatgpt: { turns: 100, tokensOut: 0, reasoningTurns: 0, estimatedTurns: 10 } };
  const view = buildScopeView(store, store.settings, 'today', null, NOON);
  assert.equal(view.estimatedRatio, 0.1);
});

test('buildScopeView: volumeLabel is formatted in metric', () => {
  const store = everydayStore();
  const view = buildScopeView(store, store.settings, 'today', null, NOON);
  assert.equal(view.volumeLabel, '5.4 L');
});

test('buildScopeView: empty day scope builds an all-zero band view', () => {
  const store = everydayStore();
  store.days = {};
  const view = buildScopeView(store, store.settings, 'today', null, NOON);
  assert.deepEqual(view.band, { low: 0, mid: 0, high: 0 });
  assert.equal(view.estimatedRatio, 0);
  assert.equal(view.volumeLabel, '0 mL');
  assert.equal(view.primary.label, 'less than one drop');
});
