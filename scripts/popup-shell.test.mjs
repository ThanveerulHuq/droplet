import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../entrypoints/popup/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/ui/app.ts', import.meta.url), 'utf8');
const style = await readFile(new URL('../src/ui/style.css', import.meta.url), 'utf8');
const methodology = await readFile(new URL('../src/ui/methodology.ts', import.meta.url), 'utf8');

test('popup shell keeps methodology as the only footer control', () => {
  const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)?.[1];

  assert.ok(footer, 'popup shell has a footer');
  assert.match(html, /id="methodologyLink"/);
  assert.doesNotMatch(html, /id="buildInfo"|id="seedDemoBtn"/);
  assert.doesNotMatch(app, /seedDemoStore|seedDemoBtn|buildInfo/);
  assert.doesNotMatch(style, /#buildInfo/);
  assert.deepEqual(
    [...footer.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/gi)].map((match) => match[1]),
    ['a', 'a'],
  );
  assert.match(footer, /<a\b(?=[^>]*\bid\s*=\s*["']methodologyLink["'])[^>]*>[\s\S]*?<\/a>/i);
  assert.equal(
    footer.replace(/<a\b(?=[^>]*\bid\s*=\s*["']methodologyLink["'])[^>]*>[\s\S]*?<\/a>/i, '').trim(),
    '',
  );
});

test('popup header pairs the Droplet icon and name with tracking', () => {
  const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i)?.[1];

  assert.ok(header, 'popup shell has a header');
  assert.match(header, /<img\b(?=[^>]*\bsrc\s*=\s*["']\/icons\/droplet\.webp["'])[^>]*>/i);
  assert.match(header, /<h1>Droplet<\/h1>/);
  assert.match(header, /id="trackingSwitch"/);
});

test('popup does not render a model-version label', () => {
  assert.doesNotMatch(methodology, /model v\$\{COEFFICIENTS\.modelVersion\}/);
});

test('methodology opens as an external resource instead of an in-popup panel', () => {
  assert.match(
    html,
    /<a\b(?=[^>]*\bid\s*=\s*["']methodologyLink["'])(?=[^>]*\bhref\s*=\s*["']https:\/\/droplet-rho\.vercel\.app\/methodology\.html["'])[^>]*>/i,
  );
  assert.doesNotMatch(html, /id="methodology"/);
  assert.doesNotMatch(app, /renderMethodology|show\('methodology'\)|getElementById\('methodology'\)/);
});

test('paused tracking dims the popup without removing the switch', () => {
  assert.match(app, /document\.body\.classList\.toggle\('tracking-paused', !settings\.tracking\)/);
  assert.match(style, /body\.tracking-paused #app\s*\{[\s\S]*?opacity:/);
  assert.match(html, /id="trackingSwitch"/);
});
