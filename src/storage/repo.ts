import { emptyStore, type Settings, type Store } from './schema.ts';
import { migrate } from './migrations.ts';
import { log } from '../lib/log.ts';

const KEY = 'droplet_store';

function isStore(raw: unknown): raw is Store {
  if (typeof raw !== 'object' || raw === null) return false;
  const s = raw as Record<string, unknown>;
  const meta = s.meta;
  return (
    typeof meta === 'object' && meta !== null &&
    Number.isInteger((meta as Record<string, unknown>).schemaVersion) &&
    ((meta as Record<string, unknown>).schemaVersion as number) >= 1 &&
    typeof (meta as Record<string, unknown>).modelVersion === 'string' &&
    typeof s.settings === 'object' && s.settings !== null &&
    typeof s.days === 'object' && s.days !== null &&
    typeof s.chats === 'object' && s.chats !== null &&
    Array.isArray(s.seen)
  );
}

export const repo = {
  async load(): Promise<Store> {
    const raw = (await browser.storage.local.get(KEY))[KEY];
    if (!isStore(raw)) {
      log.warn('stored data failed validation, starting fresh', raw);
      return emptyStore();
    }
    return migrate(raw);
  },
  async save(store: Store): Promise<void> { await browser.storage.local.set({ [KEY]: store }); },
  async getSettings(): Promise<Settings> { return (await this.load()).settings; },
  async saveSettings(settings: Settings): Promise<void> {
    const store = await this.load();
    store.settings = settings;
    await this.save(store);
  },
};
