import { emptyStore, type Store } from './schema.ts';
import { migrate } from './migrations.ts';

const KEY = 'droplet_store';

export const repo = {
  async load(): Promise<Store> {
    const raw = (await browser.storage.local.get(KEY))[KEY];
    return migrate(raw ? (raw as unknown as Store) : emptyStore());
  },
  async save(store: Store): Promise<void> { await browser.storage.local.set({ [KEY]: store }); },
};
