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
