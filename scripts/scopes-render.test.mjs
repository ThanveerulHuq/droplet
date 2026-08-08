import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/ui/scopes.ts', import.meta.url), 'utf8');

test('scope render groups an estimate in an editorial reading', () => {
  assert.match(source, /el\('section', 'estimate-reading'\)/);
});

test('scope render omits the repeated secondary comparison and model version', () => {
  assert.doesNotMatch(source, /view\.secondary/);
  assert.doesNotMatch(source, /model-version|COEFFICIENTS/);
});

test('scope render puts response metadata after the estimate details', () => {
  assert.match(source, /reading\.append\(headline, subtitle\);/);
  assert.match(source, /reading\.append\(headline, subtitle\);[\s\S]*?reading\.appendChild\(meta\);/);
});

test('scope render omits the estimated-response footnote', () => {
  assert.doesNotMatch(source, /responses were estimated|estimatedRatio/);
});

test('scope controls retain pressed-state semantics', () => {
  assert.match(source, /btn\.setAttribute\('aria-pressed', String\(id === active\)\)/);
});
