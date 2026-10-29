/* Render the images the site ships: the share card and the icons.
 *
 *   node scripts/render.mjs
 *
 * Serves the repo, then waits while a drawing page POSTs finished PNGs to
 * /__write/<name> and finally /__done. The drawing happens in a browser
 * because that is where the brand face actually loads: anything rendered
 * here would fall back to a system font and look almost right.
 *
 *   src/card.html   -> card.png
 *   src/icon.html   -> favicon.ico, favicon-32.png, apple-touch-icon.png
 *
 * Neither is part of the normal build. The committed PNGs are what ships;
 * these change about as often as the wordmark does. */
import { createServer } from 'node:http';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { extname, resolve, normalize, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT || 8791);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

/* An .ico is a 6-byte header, one 16-byte entry per size, then the images
   themselves — and since Vista each image may simply be a PNG. So the two
   favicon PNGs the browser just drew can be wrapped as they are, which is
   why this needs no image library and no dependency. */
async function packIco(written){
  // only pack what THIS run drew. Reading whatever is on disk looks like it
  // works and quietly drops a size: the card's run found no 16 (the icon run
  // before it had already folded that one in and deleted it) and rewrote the
  // .ico with the 32 alone.
  const parts = [];
  for (const [size, name] of [[16, 'favicon-16.png'], [32, 'favicon-32.png']]) {
    if (!written.has(name)) continue;
    parts.push([size, await readFile(resolve(root, name))]);
  }
  if (parts.length < 2) return;                  // not an icon run

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2);
  header.writeUInt16LE(parts.length, 4);

  const dir = Buffer.alloc(16 * parts.length);
  let offset = header.length + dir.length;
  parts.forEach(([size, png], i) => {
    const at = i * 16;
    dir[at] = size === 256 ? 0 : size;           // 0 means 256 in this format
    dir[at + 1] = size === 256 ? 0 : size;
    dir[at + 2] = 0; dir[at + 3] = 0;
    dir.writeUInt16LE(1, at + 4);                // colour planes
    dir.writeUInt16LE(32, at + 6);               // bits per pixel
    dir.writeUInt32LE(png.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });

  const ico = Buffer.concat([header, dir, ...parts.map(([, png]) => png)]);
  await writeFile(resolve(root, 'favicon.ico'), ico);
  console.log(`${'favicon.ico'.padEnd(22)} ${(ico.length / 1024).toFixed(1)} KB  (${parts.map(([s]) => s + 'px').join(', ')})`);
  // 16 only ever existed to go inside the .ico
  await rm(resolve(root, 'favicon-16.png'), {force: true});
}

const written = new Set();

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__write/')) {
    // the name comes off the URL, so it is checked rather than trusted
    const name = decodeURIComponent(req.url.slice('/__write/'.length));
    if (!/^[a-z0-9][a-z0-9.-]*\.png$/.test(name)) { res.writeHead(400).end('bad name'); return; }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const png = Buffer.concat(chunks);
    await writeFile(resolve(root, name), png);
    written.add(name);
    res.writeHead(200).end('ok');
    console.log(`${name.padEnd(22)} ${(png.length / 1024).toFixed(1)} KB`);
    return;
  }
  if (req.method === 'POST' && req.url === '/__done') {
    await packIco(written);
    res.writeHead(200).end('ok');
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
  console.log(`Card   http://127.0.0.1:${PORT}/src/card.html?save`);
  console.log(`Icons  http://127.0.0.1:${PORT}/src/icon.html?save`);
  console.log('Waiting for a page to post…  (exits when one says it is done)');
});
