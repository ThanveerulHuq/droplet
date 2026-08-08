import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../src/ui/style.css', import.meta.url), 'utf8');

test('popup stylesheet defines the editorial palette', () => {
  assert.match(css, /--ink:/);
  assert.match(css, /--paper:/);
});

test('popup stylesheet uses tabular figures for numerical readings', () => {
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
});

test('popup stylesheet exposes keyboard focus and motion-safe states', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test('popup stylesheet does not use the retired green switch color', () => {
  assert.doesNotMatch(css, /#34c759/i);
});

test('popup stylesheet does not reserve space for the removed model version', () => {
  assert.doesNotMatch(css, /\.model-version/);
});
