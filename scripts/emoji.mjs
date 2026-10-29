/**
 * Builds src/emoji.json: the icons offered in the form icon picker.
 *
 * Fluent Emoji's folder names do not always follow from the emoji's name, and
 * the hand and body emoji carry an extra skin-tone level in their path. So
 * every candidate is requested before it is written out, and anything that
 * does not resolve is dropped rather than shipped as a broken image.
 *
 *   node scripts/emoji.mjs            keep the pinned commit
 *   node scripts/emoji.mjs --latest   repin to the current main
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'microsoft/fluentui-emoji';

// Emoji whose path carries a skin tone: assets/<Name>/Default/Flat/<slug>_flat_default.svg
const SKIN_TONED = [
  'Thumbs up', 'Waving hand', 'Folded hands', 'Clapping hands', 'Writing hand',
  'Raising hands', 'Victory hand', 'Index pointing up', 'Flexed biceps',
];

const PLAIN = `
Grinning face, Smiling face with smiling eyes, Face with tears of joy, Winking face,
Smiling face with hearts, Face blowing a kiss, Thinking face, Partying face,
Smiling face with sunglasses, Shushing face, Face with monocle, Nerd face, Hugging face,
Saluting face, Melting face,
Memo, Pencil, Clipboard, Card index dividers, Bar chart, Chart increasing, Calendar,
Spiral calendar, Alarm clock, Hourglass done, Paperclip, Pushpin, Round pushpin, Bookmark,
Books, Open book, Envelope, Inbox tray, Package, Label, Key, Locked, Unlocked,
Magnifying glass tilted left, Light bulb, Laptop, Desktop computer, Mobile phone, Camera,
Microphone, Headphone, Speech balloon, Thought balloon, Megaphone, Bell, Trophy,
1st place medal, Bullseye, Gear, Wrench, Hammer, Toolbox, Link, Rocket, Artist palette,
Paintbrush, Crayon, Scissors, Straight ruler, Test tube, Microscope, Telescope, Compass,
World map, Briefcase, Credit card, Money bag, Dollar banknote, Shopping cart, Ticket,
Wrapped gift, Balloon, Party popper, Confetti ball, Sparkles, Star, Glowing star, Fire,
High voltage, Rainbow, Sun, Crescent moon, Cloud, Snowflake, Droplet, Water wave,
Seedling, Herb, Four leaf clover, Maple leaf, Cherry blossom, Rose, Sunflower, Tulip,
Potted plant, Deciduous tree, Cactus, Mushroom,
Hot beverage, Teacup without handle, Bubble tea, Cup with straw, Beer mug,
Clinking beer mugs, Wine glass, Birthday cake, Shortcake, Cookie, Doughnut, Pizza,
Hamburger, French fries, Sushi, Bento box, Rice ball, Steaming bowl, Red apple,
Green apple, Banana, Strawberry, Watermelon, Grapes, Avocado, Broccoli,
Dog, Cat face, Fox, Bear, Panda, Penguin, Rabbit face, Unicorn, Butterfly, Honeybee,
Turtle, Whale, Dolphin, Octopus,
Airplane, Automobile, Bicycle, Locomotive, Sailboat, Anchor, Mountain, Camping,
National park, Beach with umbrella, House, Office building, School, Hospital, Castle,
Tokyo tower,
Check mark button, Cross mark, Warning, Red question mark, Information, Red heart,
Blue heart, Purple heart, Green heart, Yellow heart, Orange heart, Sparkling heart,
Hundred points, Recycling symbol, Infinity
`.split(',').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const url = (ref, path) =>
  `https://cdn.jsdelivr.net/gh/${REPO}@${ref}/assets/` +
  path.split('/').map(encodeURIComponent).join('/');

let ref;
if (process.argv.includes('--latest')) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/main`);
  ref = (await res.json()).sha;
  console.log(`repinned to ${ref}`);
} else {
  ref = JSON.parse(await readFile(resolve(root, 'src/emoji.json'), 'utf8')).ref;
  console.log(`keeping ${ref}`);
}

const candidates = [
  ...PLAIN.map((n) => [n, `${n}/Flat/${slug(n)}_flat.svg`]),
  ...SKIN_TONED.map((n) => [n, `${n}/Default/Flat/${slug(n)}_flat_default.svg`]),
];

const kept = [];
const dropped = [];
for (const [n, p] of candidates) {
  const res = await fetch(url(ref, p), { method: 'GET' });
  if (res.ok) kept.push({ n, p });
  else dropped.push(`${n} (${res.status})`);
  await new Promise((r) => setTimeout(r, 120));   // the CDN rate-limits a burst
}

kept.sort((a, b) => a.n.localeCompare(b.n));
await writeFile(resolve(root, 'src/emoji.json'),
  JSON.stringify({ ref, emoji: kept }), 'utf8');

console.log(`${kept.length} verified, ${dropped.length} dropped`);
if (dropped.length) console.log('  ' + dropped.join(', '));
