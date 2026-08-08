import { log } from '../lib/log.ts';
import { mountScopes } from './scopes.ts';
import { repo } from '../storage/repo.ts';
import { seedDemoStore } from '../storage/seed.ts';

let bound = false;

export function renderApp(): void {
  const buildInfo = document.getElementById('buildInfo');
  const scopes = document.getElementById('scopes');
  const seedBtn = document.getElementById('seedDemoBtn');

  if (!buildInfo || !(scopes instanceof HTMLElement)) {
    log.warn('popup shell missing required elements');
    return;
  }

  buildInfo.textContent = browser.runtime.getManifest().version_name ?? '';

  if (bound) return;
  bound = true;

  const scopesApi = mountScopes(scopes);

  // QA affordance (plan M2 exit): seed a demo store so all four scopes render figures.
  // The active chat key is resolved so "This chat" also shows data.
  const seed = seedBtn instanceof HTMLButtonElement ? seedBtn : null;
  seed?.addEventListener('click', async () => {
    seed.disabled = true;
    try {
      let chatKey: string | null = null;
      try {
        const res = (await browser.runtime.sendMessage({ type: 'GET_ACTIVE_CONVERSATION' })) as
          | { chatKey?: string | null }
          | null
          | undefined;
        chatKey = res?.chatKey ?? null;
      } catch {
        // no active tab / content script — seed the day scopes only
      }
      const store = seedDemoStore(Date.now(), chatKey);
      await repo.save(store);
      await scopesApi.refresh();
    } catch (err) {
      log.warn('seed demo data failed', err);
    } finally {
      seed.disabled = false;
    }
  });
}
