// Creates browser-compatible PNG icons from the supplied Droplet artwork.
// Run: node scripts/make-icons.mjs  (writes public/icons/{16,32,48,96,128}.png)

import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICON_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
const SOURCE = path.join(ICON_DIR, 'droplet.webp');
const SIZES = [16, 32, 48, 96, 128];
const CROP = 'crop=256:256:52:42';

if (!existsSync(SOURCE)) {
  throw new Error(`Icon source is missing: ${SOURCE}`);
}

mkdirSync(ICON_DIR, { recursive: true });
for (const size of SIZES) {
  const output = path.join(ICON_DIR, `${size}.png`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', SOURCE, '-vf', `${CROP},scale=${size}:${size}`, output], {
    stdio: 'inherit',
  });
}
