-- Link-only forms, step 1 of 2: the functions. Safe to run at any time.
--
-- Until now a published form was readable by anyone holding the public key,
-- and that key is in every page's source, so
--
--   GET /rest/v1/forms?published=eq.true&select=id,title
--
-- listed every published form without knowing a single link. "Published" meant
-- public, not "anyone with the link".
--
-- Row-level security cannot tell "read this row by its id" from "read every
-- row": a policy that allows the first allows the second. So in step 2 the
-- table becomes readable by its owner alone, and a form is fetched by id
-- through get_form() instead — callable by anyone, unable to produce a list.
--
-- This step changes nobody's access. It adds the two functions, and moves the
-- insert check onto one of them with exactly the meaning it had before, so it
-- can be run and checked on its own before anything is taken away.

begin;

-- A published form, one, by id. The owner reads their own through the table,
-- so this deliberately knows nothing about drafts.
create or replace function public.get_form(fid text)
returns table (id text, doc jsonb, published boolean)
language sql stable security definer set search_path = public
as $$
  select f.id, f.doc, f.published
  from public.forms f
  where f.id = fid and f.published
$$;
revoke all on function public.get_form(text) from public;
grant execute on function public.get_form(text) to anon, authenticated;

-- Whether a form will take an answer. The old insert check read the forms
-- table as whoever was submitting, so its real meaning was "published, or a
-- draft of your own" — the second half is how an owner tests a form in Preview
-- before publishing it. That meaning is written out here instead of being
-- inherited from a read policy that step 2 removes. auth.uid() reads the
-- request's JWT, so it still names the caller inside a security definer body.
create or replace function public.form_is_open(fid text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.forms f
    where f.id = fid and (f.published or f.owner = auth.uid())
  )
$$;
revoke all on function public.form_is_open(text) from public;
grant execute on function public.form_is_open(text) to anon, authenticated;

drop policy if exists subs_insert_any on public.submissions;
create policy subs_insert_any on public.submissions
  for insert with check (public.form_is_open(form_id));

commit;
