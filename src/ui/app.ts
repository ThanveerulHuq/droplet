import { log } from '../lib/log.ts';
import { mountScopes } from './scopes.ts';
import { renderMethodology } from './methodology.ts';
import { repo } from '../storage/repo.ts';

let bound = false;

export function renderApp(): void {
  const buildInfo = document.getElementById('buildInfo');
  const scopes = document.getElementById('scopes');
  const methodology = document.getElementById('methodology');
  const trackingSwitch = document.getElementById('trackingSwitch');
  const methodologyLink = document.getElementById('methodologyLink');

  if (
    !buildInfo ||
    !(scopes instanceof HTMLElement) ||
    !(methodology instanceof HTMLElement) ||
    !(trackingSwitch instanceof HTMLInputElement)
  ) {
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

  methodologyLink?.addEventListener('click', (event) => {
    event.preventDefault();
    show('methodology');
  });

  // Tracking switch (Task 26 gate): flip store.settings.tracking, re-render scopes so the
  // existing paused banner reflects the state. The switch mirrors the current tracking state.
  const syncTracking = async (): Promise<void> => {
    try {
      const settings = await repo.getSettings();
      trackingSwitch.checked = settings.tracking;
    } catch (err) {
      log.warn('failed to read tracking state', err);
    }
  };
  trackingSwitch.addEventListener('change', async () => {
    trackingSwitch.disabled = true;
    try {
      const settings = await repo.getSettings();
      await repo.saveSettings({ ...settings, tracking: trackingSwitch.checked });
      await Promise.all([scopesApi.refresh(), syncTracking()]);
    } catch (err) {
      log.warn('failed to toggle tracking', err);
      await syncTracking();
    } finally {
      trackingSwitch.disabled = false;
    }
  });

  void syncTracking();
  show('scopes');
}
