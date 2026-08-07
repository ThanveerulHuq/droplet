import type { Store } from './schema.ts';
import { SCHEMA_VERSION } from './schema.ts';

export function migrate(store: Store): Store {
  let s = store;
  while (s.meta.schemaVersion < SCHEMA_VERSION) {
    const next = migrations[s.meta.schemaVersion];
    if (!next) break; // no migration defined for this version — never loop forever
    s = next(s);
  }
  return s;
}
const migrations: Record<number, (s: Store) => Store> = {};
