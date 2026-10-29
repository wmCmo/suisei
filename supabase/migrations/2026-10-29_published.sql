-- Make a form private until it is published.
--
-- Until now any form in the table could be read by anyone holding the
-- publishable key, which ships inside the page: a form's link was the only
-- thing keeping it unlisted, and a half-written draft was as readable as a
-- finished one. A form is now readable by a stranger only once its owner has
-- published it.
--
-- Run this once against the existing project. Every form that exists today is
-- backfilled as published, so nothing that is already shared stops working.

alter table public.forms
  add column if not exists published boolean not null default false;

-- anything that predates this column was already live by being linked
update public.forms set published = true where published = false;

create index if not exists forms_owner_updated
  on public.forms (owner, updated_at desc);

-- a stranger sees a published form; you always see your own
drop policy if exists forms_read_all on public.forms;
drop policy if exists forms_read_published_or_own on public.forms;

create policy forms_read_published_or_own on public.forms
  for select using (published or owner = auth.uid());

-- An answer may only be inserted against a form the inserting role can see,
-- so this now also means: an unpublished form cannot collect answers. The
-- policy text does not change; its meaning narrows with the one above.

-- ---------------------------------------------------------------------------
-- Deleting a response. There was no way to: insert and select were granted on
-- submissions and delete was not, so a wrong answer could be collected and
-- never removed, by anyone, including the person who owns the form.
drop policy if exists subs_delete_owner on public.submissions;
create policy subs_delete_owner on public.submissions
  for delete using (
    exists (select 1 from public.forms f where f.id = form_id and f.owner = auth.uid())
  );

grant delete on public.submissions to authenticated;

-- A connectivity check against the live project left this row on a real form.
delete from public.submissions where id = 'probe_after_policy';
