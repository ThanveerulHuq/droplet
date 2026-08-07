import { repo } from '../storage/repo.ts';
import { log } from '../lib/log.ts';

let bound = false;

export function renderApp(): void {
  const buildInfo = document.getElementById('buildInfo');
  const status = document.getElementById('status');
  const storageCheckBtn = document.getElementById('storageCheckBtn');

  if (!buildInfo || !status || !(storageCheckBtn instanceof HTMLButtonElement)) {
    log.warn('popup shell missing required elements');
    return;
  }

  buildInfo.textContent = browser.runtime.getManifest().version_name ?? '';

  if (bound) return;
  bound = true;

  storageCheckBtn.addEventListener('click', async () => {
    storageCheckBtn.disabled = true;
    try {
      const store = await repo.load();
      status.textContent = `storage ok — installed ${new Date(store.meta.installedAt).toISOString()}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      status.textContent = `storage error: ${message}`;
      log.warn('storage check failed', err);
    } finally {
      storageCheckBtn.disabled = false;
    }
  });
}
