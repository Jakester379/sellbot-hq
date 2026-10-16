-- Sellbot HQ cloud database setup for Supabase
-- Run this entire script in Supabase SQL Editor.

create table if not exists public.sellbot_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sellbot_profiles enable row level security;

drop policy if exists "Users can read their own Sellbot profile" on public.sellbot_profiles;
create policy "Users can read their own Sellbot profile"
on public.sellbot_profiles for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own Sellbot profile" on public.sellbot_profiles;
create policy "Users can insert their own Sellbot profile"
on public.sellbot_profiles for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own Sellbot profile" on public.sellbot_profiles;
create policy "Users can update their own Sellbot profile"
on public.sellbot_profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.sellbot_profiles to authenticated;
