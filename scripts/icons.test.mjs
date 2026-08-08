import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('icon generator uses the supplied droplet source at every required size', () => {
  const generator = readFileSync(new URL('./make-icons.mjs', import.meta.url), 'utf8');

  assert.match(generator, /droplet\.webp/);
  assert.match(generator, /ffmpeg/);
  assert.match(generator, /crop=256:256:52:42/);
  for (const size of [16, 32, 48, 96, 128]) {
    assert.match(generator, new RegExp(`\\b${size}\\b`));
  }
});
