/**
 * Builds the pages from src/ and checks that the stylesheet still obeys its
 * own rule: decisions live in tokens.css, app.css only refers to them.
 *
 *   node scripts/build.mjs          -> index.html, states.html
 *   node scripts/build.mjs --strict -> also fails on the warnings
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFile(resolve(root, f), 'utf8');
const strict = process.argv.includes('--strict');

const [page, states, tokens, app, js] = await Promise.all([
  read('src/page.html'), read('src/states.html'),
  read('src/tokens.css'), read('src/app.css'), read('src/app.js'),
]);

/* ---------------------------------------------------------------- the lint */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const lines = stripComments(app).split('\n');

const errors = [];
const warnings = [];
// a colour written out in app.css is a decision in the wrong file
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
// spacing and corner values belong to the scale, longhands included
const SPACING = /(?<![\w-])(?:padding|margin|gap|row-gap|column-gap|border-radius)(?:-(?:top|right|bottom|left|block|inline|start|end))?\s*:\s*([^;}]+)/g;
const RAW_PX = /(?<![\w-])(\d+(?:\.\d+)?)px/;

lines.forEach((line, i) => {
  const at = `app.css:${i + 1}`;
  if (COLOUR.test(line)) errors.push(`${at}  colour literal — ${line.trim().slice(0, 72)}`);
  for (const m of line.matchAll(SPACING)) {
    const px = m[1].match(RAW_PX);
    // 0 and hairline-scale values are structure, not spacing decisions
    if (px && Number(px[1]) > 2) {
      errors.push(`${at}  raw ${m[0].split(':')[0].trim()} — use a step from the spacing scale`);
    }
  }
  const fs = line.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/);
  if (fs) errors.push(`${at}  raw font-size ${fs[1]}px — use a step from the type scale`);
});

if (errors.length) {
  console.error(`\n${errors.length} error(s) — a decision is living outside tokens.css:\n`);
  errors.forEach((e) => console.error('  ' + e));
  console.error('\nAdd a token for it, then refer to the token here.\n');
  process.exit(1);
}

const byKind = warnings.reduce((acc, w) => {
  const kind = w.includes('font-size') ? 'type' : 'spacing';
  acc[kind] = (acc[kind] || 0) + 1;
  return acc;
}, {});

/* --------------------------------------------------------------- the pages */
const fill = (shell) => shell
  .replace('<!--#tokens-->', `<style>\n${tokens.trim()}\n</style>`)
  .replace('<!--#app-css-->', `<style>\n${app.trim()}\n</style>`)
  .replace('<!--#app-js-->', `<script>\n${js.trim()}\n</script>`);

const out = [
  ['index.html', fill(page)],
  ['states.html', fill(states)],
];
for (const [name, html] of out) {
  await writeFile(resolve(root, name), html, 'utf8');
  console.log(`${name.padEnd(12)} ${(html.length / 1024).toFixed(1)} KB`);
}

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s): ${Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(', ')}`);
  console.log('These are values that should come from a scale. Run with --warnings to list them.');
  if (process.argv.includes('--warnings')) warnings.forEach((w) => console.log('  ' + w));
  if (strict) process.exit(1);
} else {
  console.log('\nStylesheet is clean: no literals, everything from the scales.');
}
