import { log } from '../lib/log.ts';
import { mountScopes } from './scopes.ts';
import { repo } from '../storage/repo.ts';

let bound = false;

export function renderApp(): void {
  const scopes = document.getElementById('scopes');
  const trackingSwitch = document.getElementById('trackingSwitch');

  if (
    !(scopes instanceof HTMLElement) ||
    !(trackingSwitch instanceof HTMLInputElement)
  ) {
    log.warn('popup shell missing required elements');
    return;
  }

  if (bound) return;
  bound = true;

  const scopesApi = mountScopes(scopes);

  // Tracking switch (Task 26 gate): flip store.settings.tracking, re-render scopes so the
  // existing paused banner reflects the state. The switch mirrors the current tracking state.
  const syncTracking = async (): Promise<void> => {
    try {
      const settings = await repo.getSettings();
      trackingSwitch.checked = settings.tracking;
      document.body.classList.toggle('tracking-paused', !settings.tracking);
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
}
