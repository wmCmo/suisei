-- Suisei — forms and submissions.
--
-- Run this in the Supabase SQL editor. It assumes the Data API settings you
-- have: "Automatically expose new tables" OFF, which is why every grant below
-- is written out, and "Enable automatic RLS" ON, which the explicit enables
-- here make redundant rather than conflicting.
--
-- The access model is the one the app already enforced elsewhere:
--   forms        anyone may read a published form; the owner always reads
--                their own, published or not
--                only the owner may write
--   submissions  anyone may insert (that is what a public form is)
--                only the form's owner may read them back

create table if not exists public.forms (
  id          text primary key,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default 'Untitled form',
  published   boolean not null default false,
  doc         jsonb not null,              -- the whole form: blocks, logic, hidden, theme
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.submissions (
  id          text primary key,
  form_id     text not null references public.forms (id) on delete cascade,
  answers     jsonb not null default '{}'::jsonb,
  hidden      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists forms_owner_updated
  on public.forms (owner, updated_at desc);

create index if not exists submissions_form_id_created_at
  on public.submissions (form_id, created_at desc);

-- ---------------------------------------------------------------- row level
alter table public.forms       enable row level security;
alter table public.submissions enable row level security;

drop policy if exists forms_read_all              on public.forms;
drop policy if exists forms_read_published_or_own on public.forms;
drop policy if exists forms_read_own      on public.forms;
drop policy if exists forms_write_owner   on public.forms;
drop policy if exists forms_update_owner  on public.forms;
drop policy if exists forms_delete_owner  on public.forms;
drop policy if exists subs_insert_any     on public.submissions;
drop policy if exists subs_read_owner     on public.submissions;
drop policy if exists subs_delete_owner   on public.submissions;

-- The table is readable by its owner alone. A form someone was sent is read
-- through get_form(), one id at a time, and only while it is published — so a
-- form is reachable by anyone holding its link and listable by nobody.
-- (A policy cannot make that distinction: one that allows reading a row by id
-- allows reading every row. That is why this is a function.)
create policy forms_read_own on public.forms
  for select using (owner = auth.uid());

create or replace function public.get_form(fid text)
returns table (id text, doc jsonb, published boolean)
language sql stable security definer set search_path = public
as $$
  select f.id, f.doc, f.published from public.forms f
  where f.id = fid and f.published
$$;
revoke all on function public.get_form(text) from public;
grant execute on function public.get_form(text) to anon, authenticated;

-- whether a form will take an answer: published, or a draft of your own (that
-- is how an owner tests a form in Preview). Stated outright, rather than
-- inherited from what the person submitting happens to be able to read.
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

create policy forms_write_owner on public.forms
  for insert with check (auth.uid() = owner);

create policy forms_update_owner on public.forms
  for update using (auth.uid() = owner) with check (auth.uid() = owner);

create policy forms_delete_owner on public.forms
  for delete using (auth.uid() = owner);

-- anyone may answer a published form, including a signed-out visitor
create policy subs_insert_any on public.submissions
  for insert with check (public.form_is_open(form_id));

-- only the person who owns the form may read what came back
create policy subs_read_owner on public.submissions
  for select using (
    exists (select 1 from public.forms f where f.id = form_id and f.owner = auth.uid())
  );

-- and only they may remove one
create policy subs_delete_owner on public.submissions
  for delete using (
    exists (select 1 from public.forms f where f.id = form_id and f.owner = auth.uid())
  );

-- -------------------------------------------------------------------- grants
-- With "Automatically expose new tables" off, the Data API roles have no
-- privileges on these tables until they are granted. RLS still decides which
-- rows; these decide whether the table is reachable at all.
grant usage on schema public to anon, authenticated;

grant select                 on public.forms       to anon, authenticated;
grant insert, update, delete on public.forms       to authenticated;

grant insert                 on public.submissions to anon, authenticated;
grant select, delete         on public.submissions to authenticated;

-- updated_at maintained server-side so a client cannot backdate a form
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists forms_touch_updated_at on public.forms;
create trigger forms_touch_updated_at
  before update on public.forms
  for each row execute function public.touch_updated_at();
