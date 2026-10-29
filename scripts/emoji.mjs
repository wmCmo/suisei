/**
 * Builds src/emoji.json: every icon the form icon picker offers.
 *
 * It used to walk a hand-written list of names and probe each one, because
 * Fluent Emoji's folder names do not follow from the emoji's name and the hand
 * and body emoji carry an extra skin-tone level in their path. That capped the
 * picker at what somebody had thought to type out, and cost one request per
 * candidate.
 *
 * So instead: read the repository's own tree once, at a pinned commit, and keep
 * every Flat SVG it actually contains. No guessing, no probing, and the path is
 * whatever the repo says it is — including the skin-toned ones, which simply
 * have Default in the middle.
 *
 *   node scripts/emoji.mjs            keep the pinned commit
 *   node scripts/emoji.mjs --latest   repin to the current main
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'microsoft/fluentui-emoji';
const OUT = resolve(root, 'src/emoji.json');

const gh = async (path) => {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    headers: {accept: 'application/vnd.github+json', 'user-agent': 'suisei-emoji-index'},
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path} — ${await res.text()}`);
  return res.json();
};

const pinned = async () => {
  try { return JSON.parse(await readFile(OUT, 'utf8')).ref; } catch { return null; }
};

const ref = process.argv.includes('--latest') || !(await pinned())
  ? (await gh('commits/main')).sha
  : await pinned();

console.log(`Reading ${REPO} @ ${ref.slice(0, 12)}`);
const tree = await gh(`git/trees/${ref}?recursive=1`);
if (tree.truncated) throw new Error('the tree came back truncated; this needs paging before it can be trusted');

/* assets/<Name>/Flat/<slug>_flat.svg
   assets/<Name>/Default/Flat/<slug>_flat_default.svg   (the skin-toned ones)
   Anything else in the repo — 3D, Color, High Contrast, other skin tones — is
   deliberately left out: Flat is a couple of KB and a grid of them stays cheap. */
const FLAT = /^assets\/([^/]+)\/(?:Default\/)?Flat\/[^/]+\.svg$/;

const byName = new Map();
for (const node of tree.tree) {
  if (node.type !== 'blob') continue;
  const m = FLAT.exec(node.path);
  if (!m) continue;
  const [, name] = m;
  const p = node.path.slice('assets/'.length);
  // a plain Flat beats a Default/Flat for the same emoji, so the picker shows
  // the neutral form rather than one arbitrary skin tone
  const better = !byName.has(name) || (!p.includes('/Default/') && byName.get(name).includes('/Default/'));
  if (better) byName.set(name, p);
}

const list = [...byName]
  .map(([n, p]) => ({n, p}))
  .sort((a, b) => a.n.localeCompare(b.n, 'en'));

await writeFile(OUT, JSON.stringify({ref, emoji: list}), 'utf8');
console.log(`${list.length} icons -> src/emoji.json  (${((await readFile(OUT)).length / 1024).toFixed(0)} KB)`);
