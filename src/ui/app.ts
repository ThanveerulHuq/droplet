import { log } from '../lib/log.ts';
import { mountScopes } from './scopes.ts';
import { renderMethodology } from './methodology.ts';
import { mountSettings } from './settings.ts';
import { repo } from '../storage/repo.ts';
import { seedDemoStore } from '../storage/seed.ts';

type View = 'scopes' | 'methodology' | 'settings';

const VIEW_SECTIONS: ReadonlyArray<View> = ['scopes', 'methodology', 'settings'];

let bound = false;

export function renderApp(): void {
  const buildInfo = document.getElementById('buildInfo');
  const scopes = document.getElementById('scopes');
  const methodology = document.getElementById('methodology');
  const seedBtn = document.getElementById('seedDemoBtn');
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.view-tab'));

  if (!buildInfo || !(scopes instanceof HTMLElement) || !(methodology instanceof HTMLElement)) {
    log.warn('popup shell missing required elements');
    return;
  }

  buildInfo.textContent = browser.runtime.getManifest().version_name ?? '';

  if (bound) return;
  bound = true;

  const scopesApi = mountScopes(scopes);
  renderMethodology(methodology);
  let settingsMounted = false;

  // Settings re-render fresh from storage each time the tab is opened (R6.1: a settings change
  // re-renders scopes immediately via onChanged → scopesApi.refresh).
  const mountSettingsView = (): void => {
    const settings = document.getElementById('settings');
    if (!(settings instanceof HTMLElement) || settingsMounted) return;
    settingsMounted = true;
    mountSettings(settings, () => void scopesApi.refresh());
  };

  // Static methodology panel renders once at mount; settings re-renders on save (Task 25).
  const show = (view: View): void => {
    for (const section of VIEW_SECTIONS) {
      const node = document.getElementById(section);
      if (node) node.hidden = section !== view;
    }
    for (const tab of tabs) {
      tab.setAttribute('aria-selected', String(tab.dataset.view === view));
      tab.classList.toggle('active', tab.dataset.view === view);
    }
    if (view === 'settings') mountSettingsView();
  };
  for (const tab of tabs) {
    const view = tab.dataset.view as View | undefined;
    if (!view || !VIEW_SECTIONS.includes(view)) continue;
    tab.addEventListener('click', () => show(view));
  }
  show('scopes');

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
