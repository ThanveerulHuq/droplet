import { log } from '../lib/log.ts';
import { mountScopes } from './scopes.ts';
import { renderMethodology } from './methodology.ts';
import { repo } from '../storage/repo.ts';
import { seedDemoStore } from '../storage/seed.ts';

let bound = false;

export function renderApp(): void {
  const buildInfo = document.getElementById('buildInfo');
  const scopes = document.getElementById('scopes');
  const methodology = document.getElementById('methodology');
  const methodologyBtn = document.getElementById('methodologyBtn');
  const trackingBtn = document.getElementById('trackingBtn');
  const seedBtn = document.getElementById('seedDemoBtn');

  if (!buildInfo || !(scopes instanceof HTMLElement) || !(methodology instanceof HTMLElement)) {
    log.warn('popup shell missing required elements');
    return;
  }

  buildInfo.textContent = browser.runtime.getManifest().version_name ?? '';

  if (bound) return;
  bound = true;

  const scopesApi = mountScopes(scopes);
  renderMethodology(methodology, () => show('scopes'));

  // Two-state view: scopes (default) or the methodology panel (footer "How this works").
  const show = (view: 'scopes' | 'methodology'): void => {
    scopes.hidden = view !== 'scopes';
    methodology.hidden = view !== 'methodology';
  };

  methodologyBtn?.addEventListener('click', () => show('methodology'));

  // Footer tracking pause (Task 26 gate): flip store.settings.tracking, re-render scopes so the
  // existing paused banner reflects the state. Button label mirrors the current state.
  const syncTracking = async (): Promise<void> => {
    if (!(trackingBtn instanceof HTMLButtonElement)) return;
    try {
      const settings = await repo.getSettings();
      trackingBtn.textContent = settings.tracking ? 'Pause tracking' : 'Resume tracking';
    } catch (err) {
      log.warn('failed to read tracking state', err);
    }
  };
  trackingBtn?.addEventListener('click', async () => {
    if (!(trackingBtn instanceof HTMLButtonElement)) return;
    trackingBtn.disabled = true;
    try {
      const settings = await repo.getSettings();
      await repo.saveSettings({ ...settings, tracking: !settings.tracking });
      await Promise.all([scopesApi.refresh(), syncTracking()]);
    } catch (err) {
      log.warn('failed to toggle tracking', err);
    } finally {
      trackingBtn.disabled = false;
    }
  });

  // QA affordance (plan M2 exit): seed a demo store so all four scopes render figures.
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

  void syncTracking();
  show('scopes');
}
