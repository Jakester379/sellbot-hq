-- Sellbot HQ — Supabase schema
-- Run in Supabase → SQL Editor. Safe to re-run: it won't drop your data.

create table if not exists public.sellbot_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row-level security: each signed-in user can only see and change their own row.
-- Without this, anyone with your public key could read every row.
alter table public.sellbot_profiles enable row level security;

drop policy if exists "own row: select" on public.sellbot_profiles;
drop policy if exists "own row: insert" on public.sellbot_profiles;
drop policy if exists "own row: update" on public.sellbot_profiles;
drop policy if exists "own row: delete" on public.sellbot_profiles;

create policy "own row: select" on public.sellbot_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own row: insert" on public.sellbot_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own row: update" on public.sellbot_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own row: delete" on public.sellbot_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Quick check after running: this should return 'true'
-- select relrowsecurity from pg_class where relname = 'sellbot_profiles';
