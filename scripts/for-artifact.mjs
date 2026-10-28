/**
 * Turns index.html into the fragment a claude.ai Artifact expects:
 * no <!doctype>, <html>, <head> or <body> of its own, and without the base
 * reset the artifact host already supplies.
 *
 *   node scripts/for-artifact.mjs
 *   -> dist/artifact.html
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = await readFile(resolve(root, 'index.html'), 'utf8');

const titleAt = src.indexOf('<title>');
const headEnd = src.indexOf('</head>');
const bodyAt = src.indexOf('<body>');
const bodyEnd = src.lastIndexOf('</body>');

if (titleAt < 0 || headEnd < 0 || bodyAt < 0 || bodyEnd < 0) {
  throw new Error('index.html is not the document this script expects');
}

const base = /\/\* base:start[\s\S]*?\/\* base:end \*\/\n/;
const head = src
  .slice(titleAt, headEnd)
  .replace(base, '')
  // the artifact runs inside a phone-shaped frame; this promises the side gutters
  .replace('</title>', '</title>\n<meta name="claude:viewport-fit-sides" content="cover">');

const body = src.slice(bodyAt + '<body>'.length, bodyEnd);
const out = `${head.trimEnd()}\n${body.trim()}\n`;

await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/artifact.html'), out, 'utf8');

const bad = ['<!doctype', '<html', '<head', '<body'].filter((t) => out.toLowerCase().includes(t));
if (bad.length) throw new Error(`fragment still contains ${bad.join(', ')}`);

console.log(`dist/artifact.html — ${out.length} bytes`);
