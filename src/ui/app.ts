import { log } from '../lib/log.ts';
import { mountScopes } from './scopes.ts';

let bound = false;

export function renderApp(): void {
  const buildInfo = document.getElementById('buildInfo');
  const scopes = document.getElementById('scopes');

  if (!buildInfo || !(scopes instanceof HTMLElement)) {
    log.warn('popup shell missing required elements');
    return;
  }

  buildInfo.textContent = browser.runtime.getManifest().version_name ?? '';

  if (bound) return;
  bound = true;

  mountScopes(scopes);
}
