import type { Store } from './schema.ts';
import { SCHEMA_VERSION } from './schema.ts';

export function migrate(store: Store): Store {
  let s = store;
  while (s.meta.schemaVersion < SCHEMA_VERSION) {
    s = migrations[s.meta.schemaVersion]?.(s) ?? s;
  }
  return s;
}
const migrations: Record<number, (s: Store) => Store> = {};
