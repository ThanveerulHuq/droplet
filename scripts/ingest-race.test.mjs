import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore } from '../src/storage/schema.ts';
import { applyTurn, toDateKey } from '../src/storage/ingest.ts';

const now = Date.now();
const today = toDateKey(now);

test('serialized writer accepts every interleaved turn (R9.7)', async () => {
  let store = emptyStore();
  const keys = ['tabA-turn1', 'tabB-turn1', 'tabA-turn2', 'tabB-turn2'];
  const accepted = [];
  let queue = Promise.resolve();
  for (const k of keys) {
    const sample = { turnKey: k, charCount: 1000, isReasoning: false, provider: 'chatgpt', chatKey: 'shared' };
    queue = queue.then(async () => {
      // read-modify-write MUST be atomic w.r.t. the queue: load, apply, save.
      const { store: next, accepted: ok } = applyTurn(store, sample, now);
      if (ok) store = next;
      accepted.push(ok);
      return ok;
    });
  }
  await queue;
  assert.deepEqual(accepted, [true, true, true, true]); // none lost to a shared-base race
  assert.equal(store.days[today].chatgpt.turns, 4);
  assert.equal(store.days[today].chatgpt.tokensOut, 1000); // 4 × 250 (1000 / 4)
  assert.equal(store.chats['shared'].counters.turns, 4);
  assert.equal(store.seen.length, 4);
  for (const k of keys) assert.equal(store.seen.includes(k), true);
});

test('non-serialized two-writer read-modify-write loses turns (why the queue exists)', () => {
  const base = emptyStore(); // the shared base both writers load from
  const writer = (keys) => {
    // Each writer has its OWN snapshot of the same base (as a storage load would),
    // and does read-modify-write on it independently.
    const snapshot = emptyStore();
    for (const k of keys) applyTurn(snapshot, { turnKey: k, charCount: 1000, isReasoning: false, provider: 'chatgpt', chatKey: 'shared' }, now);
    return snapshot;
  };
  const a = writer(['tabA-turn1', 'tabA-turn2']);
  const b = writer(['tabB-turn1', 'tabB-turn2']); // last save wins, overwriting a
  assert.equal(b.days[today].chatgpt.turns < 4, true); // 2 of 4 turns lost
  assert.equal(b.chats['shared'].counters.turns < 4, true);
  assert.equal(b.seen.length < 4, true);
  assert.equal(a.days[today].chatgpt.turns, 2); // deterministic: each saw only its own writes
});
