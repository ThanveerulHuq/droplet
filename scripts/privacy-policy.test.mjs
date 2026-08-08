import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('privacy policy discloses all required Chrome Web Store data practices', () => {
  const policy = readFileSync(new URL('../privacy-policy/index.html', import.meta.url), 'utf8');

  for (const phrase of [
    'character length',
    'does not retain, store, transmit',
    'Chrome’s local extension storage',
    'hashed message identifiers',
    'dates and timestamps used for usage summaries',
    'no network requests',
    'Limited Use requirements',
    'thanveer@revmaze.com',
  ]) {
    assert.ok(policy.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()), `Missing: ${phrase}`);
  }

});
