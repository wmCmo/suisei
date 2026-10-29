# Suisei — notes for whoever works on this next

The README says what the project is and how it is built. This file holds only
what the code does not say: traps in how the pieces fit, each one learned by
hitting it.

## The build reads `.env`, never `process.env`

`scripts/build.mjs` loads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from a `.env`
file and nothing else. With no `.env` present it does not fail — it prints
`No .env: built for this-device storage only` and produces a site that looks
completely normal and silently saves nothing to Supabase.

That is exactly what a CI build would do. Before wiring any build that does not
run from this working directory, make the loader fall back to `process.env`, or
the first green deploy will serve a broken app with no error anywhere.

It has already caused one near miss: a build run with `.env` temporarily moved
aside left a keyless `index.html` in the working tree, which was nearly
committed.

## A form belongs to the Google account that created it

`forms.owner` is `auth.uid()`, and every policy keys off it. Sign in with a
different Google account and the consequence is quiet rather than loud: your
forms still appear — forms are readable by anyone, which is how respondents load
them — but you cannot edit them, and their responses return an empty list rather
than an error.

So "my work is there but inert, and my responses have vanished" almost always
means the wrong account, not data loss. Check `store.user.email` before
believing anything worse.

## Any page that imports `app.css` inherits its class names

`index.html` (landing), `privacy.html` and `states.html` all pull in the app's
full stylesheet to stay visually consistent with the product. That means every
class the app defines is live on those pages, and a name reused for something
else silently takes the app's styling.

This has happened once already: the landing hero's paragraph was given
`class="lede"`, which `app.css` defines as a flex row for the workspace header,
and the sentence tore itself apart mid-line. Prefix new classes on those pages,
or check `app.css` first.

The related trap: fragments rendered outside a `.canvasform` have no `--f-*`
tokens, so they lose their accent, wash and sheet colours without any error —
the block menu on the landing page needs a wrapping `.canvasform` for its
selected row to have a tint at all.

## Pushing goes out as `wmCmo`

The repo is `wmCmo/suisei`, and `gh`'s active account flips back to `zach-ct` on
its own. A push as the wrong account gives `404 Repository not found`, which
reads like a bad URL. `gh auth switch --user wmCmo` first.

## Deploys are cached

GitHub Pages serves the previous `index.html` from the browser cache for a while
after a deploy. After pushing a change to the root page, a hard refresh is the
difference between "it did not deploy" and "it deployed fine".

## The stylesheet lint does not see a token faded with opacity

`scripts/build.mjs` rejects colour *literals* in `app.css` — a hex, an `rgb()`,
an `hsl()`. It has nothing to say about `color:var(--f-muted);opacity:.52`,
which produces a colour no token defines: the result depends on whatever is
painted behind it, so the same declaration is a different colour on the sheet,
on a panel and inside a selected block.

Mix the step you want instead and name it, the way `--f-faint` is mixed from
`--f-muted`. Reserve `opacity` for showing and hiding — `0` to `1` on the
gutter, the option remove, the card close.

Six of these are still in the file at the time of writing: the three
`::placeholder` rules, `.stars`, `.stars button:hover` and `.hfrow .lg`.

## `app.css` is not ordered general-then-specific, so ties go the wrong way

Several components declare the general case *after* the exception, and since
both usually have the same specificity, the general rule wins and the exception
silently does nothing. `.logic .rm` sat below `.cgroup>.nested-rm`, and
`select.fi` sat above the shared caret rule; in both cases the value that was
meant to apply simply did not.

Nothing warns about this — the stylesheet is valid and the lint is about
tokens, not cascade. When adding an override, check where the base rule for
that selector lives and put the override after it, then read the computed value
back rather than trusting the file.

## A floating element loses the form's tokens

Anything appended to `document.body` is outside `.canvasform`, where every
`--f-*` is defined. `background:var(--f-accent)` there is an invalid
declaration, not a fallback, so the element renders with no background at all —
correctly positioned and completely invisible. The drag drop-line did exactly
this. Append to the form and position relative to it.
