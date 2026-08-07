// Generates placeholder droplet icons as solid-color PNGs using only node built-ins
// (zlib for IDAT deflate + a hand-built PNG chunk writer). No external deps, no network.
// Run: node scripts/make-icons.mjs  (writes public/icons/{16,32,48,96,128}.png)

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
const SIZES = [16, 32, 48, 96, 128];

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Shade the droplet (top-left light, bottom-right dark) so it reads as rounded at small sizes.
function shade(x, y, size) {
  const t = ((x + y) / (2 * (size - 1))) * 0.35;
  return [41 - 30 * t, 111 - 60 * t, 197 - 40 * t];
}

function makeIcon(size) {
  const [bgR, bgG, bgB] = [255, 255, 255];
  const cx = (size - 1) / 2;
  const bodyR = size * 0.3;
  const bumpR = size * 0.1;

  // Droplet profile: rounded bottom circle + pointy top notch.
  function inDroplet(x, y) {
    const dx = x - cx;
    const dy = y - size * 0.6;
    if (dx * dx + dy * dy <= bodyR * bodyR) return true;
    const nx = x - cx;
    const ny = y - size * 0.2;
    if (nx * nx + ny * ny <= bumpR * bumpR) return true;
    return false;
  }

  const raw = Buffer.alloc(1 + size * size * 3);
  raw[0] = 0; // filter type: None
  let o = 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let [r, g, b] = shade(x, y, size);
      if (!inDroplet(x, y)) {
        r = bgR;
        g = bgG;
        b = bgB;
      }
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = path.join(OUT_DIR, `${size}.png`);
  writeFileSync(file, makeIcon(size));
  console.log(`wrote ${file} (${size}x${size})`);
}
