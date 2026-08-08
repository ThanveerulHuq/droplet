// Dev-only static file server for the mock harness. Serves public/mock/ at the root on
// http://localhost:5199 so the WXT_MOCK=1 mock content script can run the real chatgpt
// adapter against the replica page. Zero deps — node:http only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 5199;
const ROOT = fileURLToPath(new URL('../public/mock', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    // Malformed percent-encoding (e.g. /%zz) throws URIError — answer 400 instead of
    // letting the async handler reject and crash the process.
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad Request');
    return;
  }
  const rel = pathname === '/' ? 'chatgpt.html' : pathname;
  const filePath = normalize(join(ROOT, rel));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Forbidden');
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Droplet mock server → http://localhost:${PORT}/chatgpt.html`);
});
