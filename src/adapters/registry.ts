import type { SiteAdapter } from './types';

// Module-level registry. `registerAdapter` with an existing id replaces the first
// entry so a newer adapter version can supersede an older one without ordering side effects.
const adapters: SiteAdapter[] = [];

export function resolveAdapter(url: URL): SiteAdapter | null {
  for (const adapter of adapters) {
    if (adapter.matches(url)) return adapter;
  }
  return null;
}

export function registerAdapter(adapter: SiteAdapter): void {
  const i = adapters.findIndex((a) => a.id === adapter.id);
  if (i >= 0) adapters[i] = adapter;
  else adapters.push(adapter);
}
