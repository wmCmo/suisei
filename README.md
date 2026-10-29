# Suisei 水星

A form builder you write like a document. Type a question, press `/` to turn the
line into a block, drag blocks around, branch with When/Then rules, share a link,
read the responses.

One file, no dependencies, no build step. `index.html` is the whole app.

## Look

Two themes, **Daylight** and **Nightside**: warm stone ground, ink, mercury teal
for the brand and anything positive, solar orange for anything live or unsaved.
Type is Zen Kaku Gothic New with Zen Old Mincho as the serif option, so a form
with Japanese labels sets properly instead of falling back to whatever the OS
supplies.

Surfaces are flat and edges are real. A control is defined by its hairline, not
by a shadow pretending to be depth — the palette comes from the Suisei design
system, the neumorphic elevation in it deliberately does not.

```bash
python -m http.server 8000     # or: npx serve .
# open http://localhost:8000
```

Open it from `file://` and it still works, minus the share links (there is no
origin to build them from).

## What's in it

**Editor** — a document, not a form of forms. Enter starts a new line, `/` opens
the block menu, Backspace on an empty line removes it, arrows move between blocks,
the grip handle drags. 18 block types:

| | |
|---|---|
| Input | short answer, long answer, multiple choice, checkboxes, dropdown, number, email, phone, link, date, rating, linear scale, file |
| Layout | heading 1, heading 2, text, divider, page break |

**Pages** — a page break splits the form into steps, with a progress bar and
Back/Next. Back retraces the path actually taken, not page − 1.

**Logic** — select a question, hit Logic, and you get a rule:

> When `[question]` `[is]` `[answer]` Then `[jump to | show | hide | submit]` `[target]`

Conditions follow the question type: `is` / `is not` on choices, `is more than` /
`is less than` on numbers, ratings and scales, `contains` on text, plus
`is empty` / `is answered` on anything. A block targeted by a `show` rule starts
hidden and appears the moment its condition holds — live, while someone is
filling, not on page change. Pages whose blocks are all hidden get skipped,
hidden required questions never block submission, and answers to blocks that
ended up hidden are dropped from the response instead of stored as ghosts.

**Hidden fields** — values carried in the link that the respondent never sees.
Add them in the Share panel; they land in the response, show as `@name` columns
in the table and the CSV, and can be used in logic conditions.

```
https://you.github.io/suisei/?form=fdemo1&source=newsletter&plan=pro
```

`?form=<id>` picks the form, everything else fills a hidden field of that name.
(The hosted artifact build uses `#form-<id>~source.newsletter` instead, because
the artifact sandbox strips query strings before the page sees them. Both forms
are understood, so links keep working either way.)

**Theme** — accent, typeface, alignment, light/dark/auto, corner style, button
label and thank-you message, per form, live in the editor.

**Responses** — count, latest, average completion, per-question breakdown bars,
the full table, Copy CSV.

## Where the data lives

**In the browser, and nowhere else.** Forms and responses go to `localStorage`.
That means each visitor's answers stay in *their* browser and never reach you.
Fine for a demo or a personal tool; not a form service.

The hosted version on claude.ai uses that platform's shared store, which is why
responses are visible there and not here. To make this repo collect responses
for real, replace the `store` object near the top of the `<script>` — it is
deliberately small, five methods:

```js
store.saveForm(form)             // upsert a form
store.deleteForm(id)
store.submit(record)             // { id, formId, createdAt, answers, hidden }
store.watchSubs(formId, cb)      // cb(rows) now and on change
store.countFor(id)
```

Supabase is the shortest path: two tables (`forms`, `submissions`), the anon key
in the client, and row-level security that lets anyone insert a submission while
only you can select them. That maps onto what the hosted version already enforces.
Firebase, Cloudflare D1 or a dozen lines of Express fit the same shape.

## Publishing to claude.ai

The artifact platform wraps the page in its own `<!doctype>`/`<head>`/`<body>`,
so it wants a fragment rather than a full document:

```bash
node scripts/for-artifact.mjs    # -> dist/artifact.html
```

Publish that file as the artifact. `index.html` stays the source of truth; `dist/`
is generated and git-ignored.

## Deploying

Static hosting, nothing to build. GitHub Pages: push, then Settings → Pages →
Deploy from branch → `main` / root. Netlify, Vercel, Cloudflare Pages: drop the
folder in. The only network requests the page makes are to Google Fonts.

## Not built

Calculated fields, answer piping (`@question` inside a later question), real file
storage (the file block records the filename only), payments, embedding in another
page, email notifications.

## Files

```
index.html                 the entire app
scripts/for-artifact.mjs   index.html -> dist/artifact.html for claude.ai
```
