-- Link-only forms, step 2 of 2: stop the table being listable.
--
-- Run only once BOTH are true:
--
--   * step 1 has been run, and get_form() returns a published form by id;
--   * the app that reads through get_form() has been live for ten minutes.
--
-- The second matters because Pages serves app.html with max-age=600. A
-- respondent can keep running the previous app for that long, and the previous
-- app reads the forms table directly; after this statement that read returns
-- nothing, and they would see "This form is not available".
--
-- This is the only statement in the change that takes anything away.

begin;

drop policy if exists forms_read_published_or_own on public.forms;
drop policy if exists forms_read_own on public.forms;
create policy forms_read_own on public.forms
  for select using (owner = auth.uid());

commit;
