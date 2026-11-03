/* Regression tests for the parts of src/app.js that have broken before.
 *
 *   node scripts/test.mjs
 *
 * No dependencies. app.js is one classic browser script, so it is run here in
 * node:vm against a handful of stubbed browser globals, with nothing booted:
 * the boot line at the bottom only fires when #bar and #stage exist, and
 * getElementById always answers null. Every test gets a fresh copy of the app,
 * so state from one cannot leak into the next.
 *
 * One line per test; exits 1 if any fail. */
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ======================= the loader and its stubs =======================

   Top-level const/let in a vm script do not become properties of the context
   (only function declarations do), so an export line is appended to the
   source in memory — never on disk — to hand the names the tests need back
   out as ctx.__t. Functions such as render() are reachable on ctx directly
   and can be replaced there; the app's own calls see the replacement. */
const SRC = readFileSync(resolve(import.meta.dirname, '..', 'src', 'app.js'), 'utf8');
const EXPORTS = `
;globalThis.__t = { undoStack, store, state, canEdit, formById, condsOf, upgrade,
  groupTrue, truthy, condTrue, dropWhen, pruneEmpty, whensOf, formId, subList, csv,
  rules, ID_ALPHABET };`;

function load(){
  const noop = () => {};
  const el = () => ({ style:{ setProperty: noop }, classList:{ add: noop, remove: noop, toggle: noop },
    setAttribute: noop, appendChild: noop, remove: noop, addEventListener: noop, click: noop });
  const mem = new Map();
  const ctx = {
    document: {
      getElementById: () => null,          // null #bar/#stage: nothing boots
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: noop,
      createElement: el,
      body: el(),
      fonts: { ready: Promise.resolve(), load: () => Promise.resolve() },
    },
    localStorage: {
      getItem: k => mem.has(k) ? mem.get(k) : null,
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: k => mem.delete(k),
    },
    location: { search:'', hash:'', pathname:'/', origin:'http://x', href:'http://x/' },
    history: { replaceState: noop },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    matchMedia: () => ({ matches:false, addEventListener: noop }),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: noop,
    CSS: { supports: () => false },
    crypto: globalThis.crypto,
    fetch: () => Promise.reject(new Error('no network in tests')),
    // saveForm queues a 600 ms Supabase write that is a no-op without a
    // client; unref it so it never holds the process open
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; },
    clearTimeout: t => clearTimeout(t),
    console,
    SUISEI: {},                            // no url/key: sb is null, no network
  };
  ctx.window = ctx;                        // window is the context itself
  ctx.addEventListener = noop;
  vm.createContext(ctx);
  vm.runInContext(SRC + EXPORTS, ctx, { filename: 'src/app.js' });
  ctx.renders = 0;
  ctx.render = () => { ctx.renders++; };   // render() touches the DOM; count it instead
  // the context has its own Date; this clock is what Date.now() returns inside
  const DateIn = vm.runInContext('Date', ctx);
  let now = 1_000_000;
  DateIn.now = () => now;
  ctx.clock = { set: t => { now = t; }, add: d => { now += d; }, get: () => now };
  return ctx;
}

/* objects from the context have the context's prototypes, which strict deep
   equality rejects; compare plain JSON instead */
const plain = x => x === undefined ? x : JSON.parse(JSON.stringify(x));
const same = (actual, expected, msg) => assert.deepStrictEqual(plain(actual), expected, msg);

/* ============================== the runner ============================== */
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ======================== fixtures ======================== */
function logicForm(){
  return {
    id: 'fLOGIC', title: 'Logic', hidden: [],
    blocks: [
      { id:'q1', type:'choice', label:'Pick', options:[{id:'o1',text:'One'},{id:'o2',text:'Two'},{id:'o3',text:'Three'}] },
      { id:'q2', type:'short_text', label:'Words' },
      { id:'q3', type:'number', label:'How many' },
    ],
    logic: [],
  };
}
function r1(){
  return { id:'r1', match:'all', conds:[
    { id:'c1', when:'q1', op:'is', value:['o1','o2'] },
    { id:'g1', match:'any', conds:[
      { id:'c2', when:'q3', op:'gt', value:'5' },
      { id:'c3', when:'q2', op:'contains', value:'report' },
    ]},
  ], do:'show', target:'q2' };
}
const legacy = () => ({ id:'old', when:'q1', op:'is', value:'o1', do:'show', target:'q2' });

/* ================= 1. condition evaluator ================= */
for (const [answers, want] of [
  [{q1:'o1', q3:'9'}, true],
  [{q1:'o1', q3:'2'}, false],
  [{q1:'o1', q3:'2', q2:'a report'}, true],
  [{q1:'o3', q3:'9'}, false],
  [{q1:'o2', q3:'9'}, true],
  [{q1:['o2','o3'], q3:'9'}, true],
  [{}, false],
]) {
  test(`truthy(r1) is ${want} for ${JSON.stringify(answers)}`, () => {
    const { __t: t } = load();
    assert.equal(t.truthy(r1(), logicForm(), answers), want);
  });
}

test('legacy flat rule: true for q1=o1, false for q1=o3', () => {
  const { __t: t } = load();
  assert.equal(t.truthy(legacy(), logicForm(), {q1:'o1'}), true);
  assert.equal(t.truthy(legacy(), logicForm(), {q1:'o3'}), false);
});

test('legacy flat rule: reading it (condsOf, truthy, whensOf) does not mutate it', () => {
  const { __t: t } = load();
  const r = legacy();
  const before = JSON.stringify(r);
  const view = t.condsOf(r);
  same(view, [{id:'old-c', when:'q1', op:'is', value:'o1'}]);
  t.truthy(r, logicForm(), {q1:'o1'});
  same(t.whensOf(r), ['q1']);
  assert.equal('conds' in r, false, 'condsOf added a conds key');
  assert.equal(JSON.stringify(r), before);
});

test('upgrade() rewrites a flat rule to match:all with one cond, same truth', () => {
  const { __t: t } = load();
  const r = t.upgrade(legacy());
  assert.equal(r.match, 'all');
  same(r.conds, [{id:'old-c', when:'q1', op:'is', value:'o1'}]);
  assert.equal('when' in r || 'op' in r || 'value' in r, false, 'flat keys left behind');
  assert.equal(t.truthy(r, logicForm(), {q1:'o1'}), true);
  assert.equal(t.truthy(r, logicForm(), {q1:'o3'}), false);
});

test('upgrade() leaves an already-grouped rule alone', () => {
  const { __t: t } = load();
  const r = r1(); const before = JSON.stringify(r);
  t.upgrade(r);
  assert.equal(JSON.stringify(r), before);
});

test('an empty group is false (under all and any, and as a whole rule)', () => {
  const { __t: t } = load();
  const f = logicForm();
  assert.equal(t.groupTrue([], 'all', f, {}), false);
  assert.equal(t.groupTrue([], 'any', f, {}), false);
  assert.equal(t.truthy({id:'e', match:'all', conds:[]}, f, {q1:'o1'}), false);
});

test('an empty subgroup under all falsifies a rule whose other cond is true', () => {
  const { __t: t } = load();
  const r = {id:'e', match:'all', conds:[{id:'c1', when:'q1', op:'is', value:['o1']}, {id:'g', match:'any', conds:[]}]};
  assert.equal(t.truthy(r, logicForm(), {q1:'o1'}), false);
});

test('condTrue: is_not on a choice means none of the listed options', () => {
  const { __t: t } = load();
  const f = logicForm(); const c = {id:'x', when:'q1', op:'is_not', value:['o1','o2']};
  assert.equal(t.condTrue(c, f, {q1:'o3'}), true);
  assert.equal(t.condTrue(c, f, {q1:['o3','o2']}), false);
});

test('condTrue: a condition on a deleted question is false, not a throw', () => {
  const { __t: t } = load();
  assert.equal(t.condTrue({id:'x', when:'gone', op:'is', value:'o1'}, logicForm(), {gone:'o1'}), false);
});

/* ================= 2. dropWhen / pruneEmpty ================= */
test('dropWhen(q3) removes only c2', () => {
  const { __t: t } = load();
  const r = r1();
  assert.equal(t.dropWhen(r, 'q3'), true);
  same(r.conds.map(n => n.id), ['c1', 'g1']);
  same(r.conds[1].conds.map(n => n.id), ['c3']);
});

test('dropWhen(q3) then dropWhen(q2) removes the emptied group g1', () => {
  const { __t: t } = load();
  const r = r1();
  t.dropWhen(r, 'q3');
  assert.equal(t.dropWhen(r, 'q2'), true);
  same(r.conds.map(n => n.id), ['c1']);
});

test('pruneEmpty removes an empty group and keeps the rest', () => {
  const { __t: t } = load();
  const r = r1(); r.conds[1].conds = [];
  assert.equal(t.pruneEmpty(r), true);
  same(r.conds.map(n => n.id), ['c1']);
});

test('pruneEmpty removes nested empty groups bottom-up', () => {
  const { __t: t } = load();
  const r = {id:'n', match:'all', conds:[{id:'g', match:'any', conds:[{id:'gg', match:'all', conds:[]}]}]};
  assert.equal(t.pruneEmpty(r), false);
  same(r.conds, []);
});

test('a rule left with no conditions reports false so the caller drops it', () => {
  const { __t: t } = load();
  const r = r1();
  t.dropWhen(r, 'q3'); t.dropWhen(r, 'q2');
  assert.equal(t.dropWhen(r, 'q1'), false);
  same(r.conds, []);
  assert.equal(t.truthy(r, logicForm(), {q1:'o1', q3:'9'}), false);
});

test('dropWhen upgrades a legacy rule and empties it', () => {
  const { __t: t } = load();
  const r = legacy();
  assert.equal(t.dropWhen(r, 'q1'), false);
  same(r.conds, []);
  assert.equal('when' in r, false);
});

/* ================= 3. undoStack ================= */
// a workspace with one form open in the editor, so step() can find it
function editor(){
  const ctx = load(); const t = ctx.__t;
  const f = { id:'fUNDO', title:'', blocks:[{id:'b1', type:'short_text', label:''}], logic:[], hidden:[], theme:{} };
  t.store.forms[f.id] = f;
  t.state.formId = f.id;
  t.undoStack.reset(f);
  return { ctx, t, f: () => t.store.forms['fUNDO'] };
}
// type one character into the title the way the input handler does
const typeChar = (t, f, ch) => { f.title += ch; t.store.saveForm(f, 'title'); };

test('undo: five keyed records within 600 ms make exactly one step', () => {
  const { ctx, t, f } = editor();
  for (const ch of 'abcde') { typeChar(t, f(), ch); ctx.clock.add(100); }
  assert.equal(t.undoStack.past.length, 1);
});

test('undo: a pause over 600 ms with the same key starts a second step', () => {
  const { ctx, t, f } = editor();
  for (const ch of 'abcde') { typeChar(t, f(), ch); ctx.clock.add(100); }
  ctx.clock.add(700);
  typeChar(t, f(), 'X');
  assert.equal(t.undoStack.past.length, 2);
});

test('undo: the window is measured from the last keystroke, not the first', () => {
  const { ctx, t, f } = editor();
  for (const ch of 'abcdefghij') { typeChar(t, f(), ch); ctx.clock.add(500); }  // 4.5 s of steady typing
  assert.equal(t.undoStack.past.length, 1);
});

test('undo: record(f) with no key always starts a new step', () => {
  const { t, f } = editor();
  f().blocks.push({id:'b2', type:'short_text', label:''}); t.store.saveForm(f());
  f().blocks.push({id:'b3', type:'short_text', label:''}); t.store.saveForm(f());
  f().blocks.push({id:'b4', type:'short_text', label:''}); t.store.saveForm(f());
  assert.equal(t.undoStack.past.length, 3);
});

test('undo: a different key inside the window starts a new step', () => {
  const { ctx, t, f } = editor();
  typeChar(t, f(), 'a'); ctx.clock.add(50);
  f().theme.accent = '#000'; t.store.saveForm(f(), 'accent');
  assert.equal(t.undoStack.past.length, 2);
});

test('undo: undo restores the previous step and redo brings it back', () => {
  const { t, f } = editor();
  f().blocks.push({id:'b2', type:'short_text', label:''}); t.store.saveForm(f());
  assert.equal(t.undoStack.undo(), true);
  same(f().blocks.map(b => b.id), ['b1']);
  assert.equal(t.undoStack.redo(), true);
  same(f().blocks.map(b => b.id), ['b1', 'b2']);
  assert.equal(t.undoStack.redo(), false, 'nothing left to redo');
});

test('undo: a new record after an undo clears future', () => {
  const { ctx, t, f } = editor();
  f().blocks.push({id:'b2', type:'short_text', label:''}); t.store.saveForm(f());
  t.undoStack.undo();
  assert.equal(t.undoStack.future.length, 1);
  ctx.clock.add(1000);
  f().title = 'fork'; t.store.saveForm(f(), 'title');
  assert.equal(t.undoStack.future.length, 0);
  assert.equal(t.undoStack.redo(), false);
});

test('undo: undoing the restore does not itself record a step', () => {
  const { t, f } = editor();
  f().blocks.push({id:'b2', type:'short_text', label:''}); t.store.saveForm(f());
  t.undoStack.undo();
  assert.equal(t.undoStack.past.length, 0);
  assert.equal(t.undoStack.future.length, 1);
});

test('undo: undoing a coalesced burst restores the text from before the burst', () => {
  const { ctx, t, f } = editor();
  for (const ch of 'abcde') { typeChar(t, f(), ch); ctx.clock.add(100); }
  t.undoStack.undo();
  assert.equal(f().title, '');
});

test('undo: an edit after a coalesced burst undoes back to the end of the burst', () => {
  // type "abcde" in one burst, pause, then add a block. One undo should take
  // away only the block and leave "abcde" — not drop "bcde" with it.
  const { ctx, t, f } = editor();
  for (const ch of 'abcde') { typeChar(t, f(), ch); ctx.clock.add(100); }
  ctx.clock.add(1000);
  f().blocks.push({id:'b2', type:'short_text', label:''}); t.store.saveForm(f());
  t.undoStack.undo();
  same(f().blocks.map(b => b.id), ['b1'], 'the block should be gone');
  assert.equal(f().title, 'abcde', 'the whole burst should survive one undo');
});

test('undo: two bursts on the same key undo one burst at a time', () => {
  const { ctx, t, f } = editor();
  for (const ch of 'abc') { typeChar(t, f(), ch); ctx.clock.add(100); }
  ctx.clock.add(1000);
  for (const ch of 'xyz') { typeChar(t, f(), ch); ctx.clock.add(100); }
  t.undoStack.undo();
  assert.equal(f().title, 'abc');
  t.undoStack.undo();
  assert.equal(f().title, '');
});

/* ================= 4. formId ================= */
test('formId: 17 chars, starts with f, rest from the 32-letter alphabet', () => {
  const { __t: t } = load();
  assert.equal(t.ID_ALPHABET, 'abcdefghijkmnpqrstuvwxyz23456789');
  for (let i = 0; i < 200; i++) {
    const id = t.formId();
    assert.match(id, /^f[abcdefghijkmnpqrstuvwxyz23456789]{16}$/, id);
  }
});

test('formId: 1000 calls are all distinct', () => {
  const { __t: t } = load();
  const ids = new Set(Array.from({length:1000}, () => t.formId()));
  assert.equal(ids.size, 1000);
});

/* ================= 5. subList ================= */
test('subList: state.rows comes back newest-first', () => {
  const { __t: t } = load();
  t.state.rows = [{id:'a', createdAt:200}, {id:'b', createdAt:500}, {id:'c', createdAt:100}, {id:'d', createdAt:300}];
  same(t.subList().map(r => r.id), ['b', 'd', 'a', 'c']);
  same(t.state.rows.map(r => r.id), ['a', 'b', 'c', 'd'], 'state.rows was sorted in place');
});

test('subList: without state.rows, reads the store newest-first with duplicates dropped', () => {
  const { __t: t } = load();
  t.state.formId = 'fS';
  t.state.rows = null;
  t.store.remote = [{id:'r1', formId:'fS', createdAt:100}, {id:'r2', formId:'fS', createdAt:300}];
  t.store.subs = [{id:'r2', formId:'fS', createdAt:300, local:true}, {id:'r3', formId:'fS', createdAt:200}, {id:'x', formId:'other', createdAt:999}];
  same(t.subList().map(r => r.id), ['r2', 'r3', 'r1']);
});

/* ================= 6. canEdit ================= */
test('canEdit: false for a visiting form, true for your own, false for null', () => {
  const { __t: t } = load();
  const mine = {id:'fMINE'}, theirs = {id:'fTHEIRS'};
  t.store.forms[mine.id] = mine;
  t.store.visiting[theirs.id] = theirs;
  assert.equal(t.canEdit(theirs), false);
  assert.equal(t.canEdit(mine), true);
  assert.equal(t.canEdit({id:'fLOCALDRAFT'}), true);
  assert.equal(t.canEdit(null), false);
  assert.equal(t.canEdit(undefined), false);
});

test('saveForm refuses a visiting form (no store write, no undo step)', () => {
  const { __t: t } = load();
  const theirs = {id:'fTHEIRS', title:'x', blocks:[]};
  t.store.visiting[theirs.id] = theirs;
  t.store.saveForm(theirs, 'title');
  assert.equal(t.store.forms[theirs.id], undefined);
  assert.equal(t.undoStack.id, null);
});

/* ================= 7. csv ================= */
function csvSetup(){
  const ctx = load(); const t = ctx.__t;
  const f = { id:'fCSV', title:'C', hidden:[{name:'src'}], blocks:[
    {id:'h', type:'text', label:'Not a column'},
    {id:'t', type:'short_text', label:'Say "hi", please'},
    {id:'c', type:'choice', label:'Pick', options:[{id:'o1', text:'Yes, "really"'}, {id:'o2', text:'No'}]},
    {id:'k', type:'checkboxes', label:'Many', options:[{id:'k1', text:'A'}, {id:'k2', text:'B'}]},
    {id:'n', type:'long_text', label:''},
  ], logic:[] };
  t.store.forms[f.id] = f;
  t.state.formId = f.id;
  t.state.rows = [
    {id:'s2', createdAt: new Date(2026, 9, 30, 9, 5).getTime(),
     answers:{t:'plain', c:'o2', k:[], n:''}, hidden:{}},
    {id:'s1', createdAt: new Date(2026, 9, 29, 14, 7).getTime(),
     answers:{t:'a, b and "c"', c:'o1', k:['k1','k2'], n:'line one\nline two'}, hidden:{src:'mail'}},
  ];
  return t;
}

// a minimal RFC 4180 reader, so the assertion is about what a spreadsheet sees
function parseCsv(text){
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i+1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows;
}

test('csv: every cell quoted, quotes doubled, commas and newlines kept inside', () => {
  const t = csvSetup();
  const out = t.csv();
  assert.ok(out.includes('"a, b and ""c"""'), 'text with comma and quotes');
  assert.ok(out.includes('"Yes, ""really"""'), 'choice option text with comma and quotes');
  assert.ok(out.includes('"line one\nline two"'), 'newline kept inside its quotes');
  assert.ok(out.includes('"Say ""hi"", please"'), 'header label quoted');
});

test('csv: parses back to the right grid (header, input columns only, hidden fields)', () => {
  const t = csvSetup();
  same(parseCsv(t.csv()), [
    ['Submitted', 'Say "hi", please', 'Pick', 'Many', 'Long answer', '@src'],
    ['2026-10-29 14:07', 'a, b and "c"', 'Yes, "really"', 'A, B', 'line one\nline two', 'mail'],
    ['2026-10-30 09:05', 'plain', 'No', '', '', ''],
  ]);
});

/* ============================== run ============================== */
let failed = 0;
for (const { name, fn } of tests) {
  try { await fn(); console.log(`ok    ${name}`); }
  catch (e) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(String(e && e.message || e).split('\n').map(l => '      ' + l).join('\n'));
  }
}
console.log(`\n${tests.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
