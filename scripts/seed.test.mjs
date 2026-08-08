import test from 'node:test';
import assert from 'node:assert/strict';
import { seedDemoStore } from '../src/storage/seed.ts';
import { toDateKey } from '../src/storage/ingest.ts';

const NOW = new Date('2026-08-08T12:00:00').getTime();

test('seeds distinct non-zero day buckets so today < week < month', () => {
  const store = seedDemoStore(NOW);
  const today = store.days[toDateKey(NOW)]?.chatgpt;
  assert.ok(today, 'today bucket exists');
  assert.ok(today.turns > 0);
  assert.ok(today.tokensOut > 0);

  const countFrom = (offset) => {
    const key = toDateKey(NOW - offset * 86_400_000);
    return store.days[key]?.chatgpt?.turns ?? 0;
  };
  const todayTurns = countFrom(0);
  const weekTurns = Array.from({ length: 7 }, (_, i) => countFrom(i)).reduce((a, b) => a + b, 0);
  const monthTurns = Array.from({ length: 30 }, (_, i) => countFrom(i)).reduce((a, b) => a + b, 0);
  assert.ok(weekTurns > todayTurns, 'week > today');
  assert.ok(monthTurns > weekTurns, 'month > week');
});

test('seeds a chat bucket when given an active chat key', () => {
  const store = seedDemoStore(NOW, 'abc123');
  const chat = store.chats['abc123'];
  assert.ok(chat, 'chat entry exists');
  assert.equal(chat.provider, 'chatgpt');
  assert.ok(chat.counters.turns > 0);
  assert.ok(chat.counters.tokensOut > 0);
});

test('seeds no chat bucket when no active chat key', () => {
  const store = seedDemoStore(NOW);
  assert.deepEqual(store.chats, {});
});

test('seeded store satisfies the schema shape', () => {
  const store = seedDemoStore(NOW);
  assert.equal(typeof store.meta.schemaVersion, 'number');
  assert.equal(typeof store.meta.modelVersion, 'string');
  assert.ok(store.settings.tracking);
  assert.ok(Array.isArray(store.seen));
});
