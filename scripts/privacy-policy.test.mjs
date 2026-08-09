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

  assert.doesNotMatch(policy, /REPLACE-WITH-YOUR-EMAIL@example\.com/);
});

test('privacy policy links to the colocated methodology page', () => {
  const policy = readFileSync(new URL('../privacy-policy/index.html', import.meta.url), 'utf8');
  const methodology = readFileSync(new URL('../privacy-policy/methodology.html', import.meta.url), 'utf8');

  assert.match(policy, /href="methodology\.html"/);
  assert.match(methodology, /How the estimate is calculated/);
  assert.match(methodology, /https:\/\/github\.com\/ThanveerulHuq\/droplet/);
  assert.match(methodology, /https:\/\/arxiv\.org\/abs\/2508\.15734/);
  assert.match(methodology, /https:\/\/cacm\.acm\.org\/sustainability-and-computing\/making-ai-less-thirsty\//);
  assert.match(methodology, /https:\/\/arxiv\.org\/abs\/2304\.03271/);
  assert.match(methodology, /depends on\s+which data center served you/i);
});
