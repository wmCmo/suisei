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

**Editor** — a document, not a form of forms. Enter starts a new line (from the
title too), `/` opens the block menu, Backspace on an empty line removes it,
arrows move between blocks, and the grip handle drags — with a mouse, a pen or a
finger, scrolling the page when you reach its edge. Ctrl+Z and Ctrl+Shift+Z undo
and redo; a burst of typing in one place is one step, and anything structural is
its own. 18 block types:

| | |
|---|---|
| Input | short answer, long answer, multiple choice, checkboxes, dropdown, number, email, phone, link, date, rating, linear scale, file |
| Layout | heading 1, heading 2, text, divider, page break |

**Pages** — a page break splits the form into steps, with a progress bar and
Back/Next. Back retraces the path actually taken, not page − 1.

**Logic** — select a question, hit Logic, and you get a rule:

> When `[question]` `[is any of]` `[answers]` Then `[jump to | show | hide | submit]` `[target]`

Add conditions and they join with **and** or **or**; add a group and it nests,
so a rule can say *A and (B or C)*. Conditions follow the question type:
`is any of` / `is none of` on choices, holding as many options as you like,
`is more than` / `is less than` on numbers, ratings and scales, `contains` on
text, plus `is empty` / `is answered` on anything. Rules written before groups
existed still work as they were, and are rewritten into the new shape the first
time you edit one. A block targeted by a `show` rule starts
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

**Two runners, one block list** — a form renders either all at once or one
question at a time, and the respondent can switch mid-form without losing an
answer, because answers are keyed by block rather than by screen. A jump rule
that says "go to page 3" means its first question in the one-at-a-time runner.
Enter answers and advances; a textarea keeps Enter for newlines.

**Answer piping** — type `@` in any label to reference an earlier question, and
the answer is substituted while the form is being filled: `Nice to meet you,
@your_name`. The reference is a short stable key assigned when the question is
first referenced, so renaming the question later does not break it. An `@word`
that matches no question is left alone, which keeps email addresses intact.

**Form icon** — each form can carry an icon, shown on its card, in the editor,
and above the title of the form itself. The set is
[Fluent Emoji](https://github.com/microsoft/fluentui-emoji) by Microsoft, MIT
licensed, in the Flat style: SVGs of a few KB each, served from the repository
through jsDelivr and pinned to a commit so a rename upstream cannot quietly
break an icon someone picked.

The picker offers all 1,595 of them. `src/emoji.json` is generated, not written:
it is read from the repository's own file tree at the pinned commit, so every
path is one that exists — including the skin-toned ones, whose folders carry an
extra level. The index is served as its own file and fetched the first time the
picker opens, so the landing page and a form being answered never download it;
the grid shows a screenful and search reaches the rest.

```bash
node scripts/emoji.mjs            # rebuild the index from the pinned commit
node scripts/emoji.mjs --latest   # repin to current main, then rebuild
```

**Theme** — accent, typeface, alignment, light/dark/auto, corner style, runner,
button label and thank-you message, per form, live in the editor.

**Responses** — count, latest, average completion, per-question breakdown bars,
the full table, Copy CSV and Download CSV. Click a row and the response opens on
its own, every answer in full where the table truncates, with ‹ › (or the arrow
keys) to walk through them. Each one can be removed; that asks twice, because
undo covers the form and never a response someone sent. The workspace card goes
straight to Responses, and nothing there can change the form, so reading the
answers can't disturb what you prepared. The download carries a byte order mark,
without which Excel reads a UTF-8 export as mojibake — which matters the moment a
form is answered in anything but English.

## Signing in

Building a form writes to the project, so it needs a session; answering one
does not. Sign-in is Google, through Supabase Auth, which needs three things
set once:

1. **Google Cloud Console** — APIs & Services → Credentials → Create OAuth
   client ID → Web application. Authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`. Add
   `http://localhost:8000` to the JavaScript origins for local work.
2. **Supabase** — Authentication → Providers → Google, on, with the client ID
   and secret from step 1.
3. **Supabase** — Authentication → URL Configuration → Site URL and the
   redirect allow-list must include wherever the page is served from
   (`http://localhost:8000/**` locally).

Until that is done the Sign in button returns a provider error and the app
keeps forms in this browser. Nothing else breaks: a form that is already in
the project still loads and still collects answers from anyone.

## Draft, published, and link-only

A form is a draft when you make it, and only you can open it or test it. Publish
it from the Share panel and its link starts working for anyone who has it;
unpublish and it stops. A published form is reachable by its link and **listed
by nobody**.

That last part cannot be a row-level security policy. The publishable key ships
inside every page, and a policy that lets a stranger read a row by its id lets
them read every row: `?published=eq.true` would list every published form there
is. So the table is readable only by its owner, and a stranger's one way in is a
function:

```sql
get_form(id)       -- one published form, by id; it has no way to return a list
form_is_open(id)   -- will this form accept an answer: published, or your own draft
```

The second is what the insert policy on `submissions` asks. It used to read the
forms table as whoever was submitting, which only worked while a stranger could
see published forms — tighten the read and every answer would have been refused.

Because the id is now the whole of a form's privacy, new forms get 80 bits of it
from `crypto.getRandomValues`. Forms made earlier keep their shorter ids; changing
one would break every link already sent.

On an existing project, run the migrations in order:
`supabase/migrations/2026-10-29_published.sql`, then
`2026-11-02_link_only_1_functions.sql`, then — once an app that reads through
`get_form` has been live for ten minutes — `2026-11-02_link_only_2_policy.sql`.
The ten minutes is GitHub Pages' cache: a browser can keep running the previous
app that long, and the previous app reads the table directly.

## Where the data lives

**In Supabase**: two tables, `forms` and `submissions`, with row-level security
doing the access control described above. The project's URL and publishable key
are read from `.env` at build time and inlined into the page — that key is meant
to be public, and the policies are the boundary.

While you are signed out, the builder keeps your forms in this browser's
`localStorage` and says so in the bar ("this device"); answers people send to a
form that is in the project still reach it. Without a `.env` there is no project
at all, and everything — forms and answers — stays in each browser. The build prints
`No .env: built for this-device storage only` in that case and otherwise looks
completely normal — worth knowing before wiring it into any CI.

`supabase/schema.sql` builds a fresh project; `supabase/migrations/` brings an
existing one forward.

## How it's put together

```
src/tokens.css   decisions: colour, spacing, radius. Custom properties only.
src/app.css      selectors. Refers to tokens, never restates them.
src/app.js       the app
src/page.html    the document shell
src/states.html  a mirror of every component, drawn by the real functions
```

`tokens.css` holds one kind of line and `app.css` holds the other. The test for
where something belongs: **would a designer change it?** Mercury teal, the 4px
spacing scale, the radius steps are decisions, so they are tokens.
`position:absolute`, `flex:1`, the 680px writing column describe how a widget is
wired, so they live in `app.css`.

That split is enforced, not just intended. The build refuses to ship a colour
literal found outside `tokens.css`:

```bash
node scripts/build.mjs   # builds, and fails on anything written by hand
```

There is a regression suite too — no dependencies, about a second:

```bash
node scripts/test.mjs    # runs src/app.js in node:vm against stubbed browser globals
```

It covers the logic that has actually broken: the condition evaluator and its
older flat rules, pruning conditions when a question is deleted, undo, form ids,
response ordering, ownership checks and CSV quoting.

All three scales are enforced. A colour literal, a raw `font-size`, or a padding,
gap or radius in loose pixels fails the build, so `app.css` cannot drift back to
values chosen one rule at a time. Values of 2px and under are left alone: a
hairline is structure, not a spacing decision.

The scales themselves:

```
colour    20 tokens, Daylight and Nightside
type      9 steps, each carrying its line-height
spacing   4 8 12 16 24 32 48 64
radius    6 / 9 / 14 / pill
```

`states.html` renders every block type, in both sheets, in the builder and in
the form, using the app's own render functions rather than copied markup. One
screenshot of it shows the whole surface, so a change can be checked everywhere
instead of only where it was made.

## Deploying

Live at **https://wmcmo.github.io/suisei/**, served by GitHub Pages from `main`
at the repository root. `index.html` is committed pre-built, so Pages has
nothing to build.

A static host is enough because nothing here runs on a server. In particular
sign-in works on one: the browser is redirected to Google, Google redirects to
*Supabase's* callback, and Supabase performs the token exchange with the client
secret on its own machines. The host only ever serves files, which is also why
the secret never has to exist anywhere near this repository.

The `github.io` warning you may have read about Google sign-in is about cookies
— `github.io` is on the Public Suffix List, so browsers refuse cookies set on
it, which breaks cookie-based sessions. This app keeps its session in
localStorage and sets no cookies, so it does not apply.

Deploying anywhere new means updating two places, and the one people expect to
change does not:

```
Google Cloud -> Clients -> Suisei web
  Authorized JavaScript origins  += https://<origin>
  Authorized redirect URI         unchanged; it points at Supabase

Supabase -> Authentication -> URL Configuration
  Site URL                        https://<origin>/<path>/
  Redirect allow-list            += https://<origin>/<path>/**
```

Miss the Supabase one and sign-in appears to work, then returns you signed out
with no error anywhere.

## Not built

Calculated fields, real file storage (the file block records the filename only),
payments, embedding in another page, email notifications.

## Files

```
src/                    the source (see above)
scripts/build.mjs       build + the token lint
scripts/test.mjs        the regression suite
scripts/emoji.mjs       regenerates the icon index
scripts/render.mjs      redraws the share card and the icons in a browser
supabase/schema.sql     a fresh project
supabase/migrations/    an existing one, brought forward
index.html              built; the landing page
app.html                built; the builder, and where form links open
privacy.html            built
states.html             built; the component mirror
emoji.json              built; the icon index, fetched on demand
card.png, favicon.ico,
favicon-32.png,
apple-touch-icon.png    rendered by scripts/render.mjs
```

Everything built is committed, so the repo can be served as-is with nothing
installed.

## License

MIT — see [LICENSE](LICENSE). Use it, change it, ship it; keep the copyright
notice.

Two things in here are other people's and keep their own terms. The icons are
[Fluent Emoji](https://github.com/microsoft/fluentui-emoji) by Microsoft, MIT
licensed, loaded from their repository rather than copied into this one. The
typefaces — Zen Kaku Gothic New, Zen Old Mincho, Noto Sans Thai, Noto Serif Thai
and Noto Sans JP (for the 水 mark alone) — are served by Google Fonts under the
SIL Open Font License.
