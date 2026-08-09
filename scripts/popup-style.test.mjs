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

test('popup footer is a subdued panel-bottom affordance', () => {
  assert.match(css, /#app\s*\{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/);
  assert.match(css, /#app > footer\s*\{[\s\S]*?margin-top: auto;/);
  assert.match(css, /#methodologyLink\s*\{[\s\S]*?font-size: 10px;/);
  assert.match(css, /#app > footer\s*\{[\s\S]*?justify-content: flex-end;/);
  assert.match(css, /\.meta\s*\{[\s\S]*?text-align: right;/);
});

test('comparison images sit on the left and response metadata has no divider', () => {
  assert.match(css, /\.comparison-image\s*\{[\s\S]*?left: 0;/);
  const metaBlock = css.match(/\.meta\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.doesNotMatch(metaBlock, /border-top:/);
});

test('comparison labels beside an image stay on one line', () => {
  assert.match(css, /\.estimate-reading\.has-comparison-image \.headline\s*\{[\s\S]*?white-space: nowrap;/);
});

test('comparison reading aligns the lower quantity and details in the right column', () => {
  assert.match(css, /\.comparison-image\s*\{[\s\S]*?width: 200px;/);
  assert.match(css, /\.comparison-quantity\s*\{[\s\S]*?font-size: 60px;/);
  assert.match(css, /\.estimate-reading\.has-comparison-image \.headline\s*\{[\s\S]*?position: absolute;[\s\S]*?top: 126px;[\s\S]*?left: 205px;[\s\S]*?width: calc\(100% - 205px\);[\s\S]*?text-align: center;/);
  assert.match(css, /\.comparison-details\s*\{[\s\S]*?margin-left: 205px;[\s\S]*?padding-top: 188px;[\s\S]*?text-align: center;/);
  assert.match(css, /\.comparison-name\s*\{[\s\S]*?font-size: 18px;/);
});

test('scope tabs use a text-first icon treatment with a raised active state', () => {
  assert.match(css, /\.segmented-btn\s*\{[\s\S]*?display: flex;/);
  assert.match(css, /\.scope-icon\s*\{[\s\S]*?width: 12px;/);
  assert.match(css, /\.segmented-btn\.active\s*\{[\s\S]*?background: rgb\(50 116 109 \/ 10%\);/);
  assert.match(css, /\.segmented-btn\.active \.scope-icon\s*\{[\s\S]*?color: var\(--accent-dark\);/);
});
