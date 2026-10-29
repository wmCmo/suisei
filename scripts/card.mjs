/* Redraw the share card.
 *
 *   node scripts/card.mjs
 *
 * Serves the repo on a free port, accepts one POST of the rendered PNG from
 * src/card.html, writes it to card.png and exits. It needs a browser to do the
 * drawing: open the URL it prints if it does not open on its own.
 *
 * Nothing in the normal build touches this — the card changes about as often
 * as the wordmark does, and the committed PNG is what ships. */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, normalize, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT || 8791);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/__card') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const png = Buffer.concat(chunks);
    await writeFile(resolve(root, 'card.png'), png);
    res.writeHead(200).end('ok');
    console.log(`card.png  ${(png.length / 1024).toFixed(1)} KB`);
    server.close();
    return;
  }
  // only ever serves out of the repo, and only the handful of types above
  const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '');
  const file = join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Open  http://127.0.0.1:${PORT}/src/card.html?save`);
  console.log('Waiting for the browser to post the card…');
});
