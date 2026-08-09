import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/ui/scopes.ts', import.meta.url), 'utf8');

test('scope render groups an estimate in an editorial reading', () => {
  assert.match(source, /el\('section', 'estimate-reading'\)/);
});

test('scope render shows a primary comparison image when its rung has one', () => {
  assert.match(source, /view\.primary\.rung\.image/);
  assert.match(source, /comparison-image/);
});

test('scope render removes a leading approximation mark from the primary label', () => {
  assert.match(source, /view\.primary\.label\.replace\(\/\^≈\//);
});

test('scope render separates the comparison quantity from the item detail stack', () => {
  assert.match(source, /comparison-quantity/);
  assert.match(source, /comparison-name/);
});

test('scope render keeps the range in the midpoint volume hover text', () => {
  assert.match(source, /subtitle\.textContent = view\.volumeLabel;/);
  assert.match(source, /subtitle\.title = `\$\{low\} – \$\{high\}`;/);
});

test('scope render omits the repeated secondary comparison and model version', () => {
  assert.doesNotMatch(source, /view\.secondary/);
  assert.doesNotMatch(source, /model-version|COEFFICIENTS/);
});

test('scope render puts response metadata after the estimate details', () => {
  assert.match(source, /reading\.append\(headline, details\);/);
  assert.match(source, /reading\.append\(headline, details\);[\s\S]*?reading\.appendChild\(meta\);/);
});

test('scope render omits the estimated-response footnote', () => {
  assert.doesNotMatch(source, /responses were estimated|estimatedRatio/);
});

test('scope controls retain pressed-state semantics', () => {
  assert.match(source, /btn\.setAttribute\('aria-pressed', String\(id === active\)\)/);
});

test('scope controls pair text labels with decorative custom icons', () => {
  assert.match(source, /type ScopeIcon = 'chat' \| 'today' \| 'week' \| 'month';/);
  assert.match(source, /function scopeIcon\(icon: ScopeIcon\): SVGSVGElement/);
  assert.match(source, /svg\.classList\.add\('scope-icon'\)/);
  assert.match(source, /svg\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(source, /btn\.append\(scopeIcon\(icon\), document\.createTextNode\(label\)\)/);
});
