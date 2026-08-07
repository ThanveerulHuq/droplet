import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, SCHEMA_VERSION } from '../src/storage/schema.ts';
import { migrate } from '../src/storage/migrations.ts';

test('migrate(emptyStore()) is a no-op at SCHEMA_VERSION', () => {
  const store = emptyStore();
  assert.equal(store.meta.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrate(store), store);
});

test('migrate on a store at SCHEMA_VERSION is identity (same reference)', () => {
  const store = emptyStore();
  store.meta.schemaVersion = SCHEMA_VERSION;
  assert.equal(migrate(store), store);
});

test('migrate on a store with schemaVersion 0 returns without hanging and unchanged', () => {
  const store = emptyStore();
  store.meta.schemaVersion = 0;
  const out = migrate(store);
  assert.equal(out.meta.schemaVersion, 0); // no migration defined for v0 — unchanged
});
