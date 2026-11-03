-- Blackjack player profiles
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- It's safe to run more than once. It only adds what's missing to the
-- existing public.profiles table and never deletes data.

-- 1. Table (created only if it doesn't exist yet)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  full_name text,
  updated_at timestamptz
);

-- 2. Profile fields
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists favorite_hand text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles alter column updated_at set default now();

-- 3. Rules for the data. "not valid" means rows already in the table aren't
--    re-checked; all new and edited rows must follow these rules.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles add constraint profiles_username_format
      check (username ~ '^[A-Za-z0-9_]{3,20}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_full_name_length') then
    alter table public.profiles add constraint profiles_full_name_length
      check (char_length(full_name) between 1 and 50) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_length') then
    alter table public.profiles add constraint profiles_bio_length
      check (char_length(bio) <= 280) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_location_length') then
    alter table public.profiles add constraint profiles_location_length
      check (char_length(location) <= 60) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_url_https') then
    alter table public.profiles add constraint profiles_avatar_url_https
      check (avatar_url ~ '^https://' and char_length(avatar_url) <= 500) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_favorite_hand_length') then
    alter table public.profiles add constraint profiles_favorite_hand_length
      check (char_length(favorite_hand) <= 40) not valid;
  end if;
end $$;

-- Usernames are unique regardless of capitalisation ("Ace" and "ace" clash).
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- 4. Keep updated_at current on every edit
create or replace function public.profiles_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before insert or update on public.profiles
  for each row execute function public.profiles_set_updated_at();

-- 5. Security: signed-in players can view profiles, but can only create
--    and edit their own. Signed-out visitors can't read any profiles.
alter table public.profiles enable row level security;

drop policy if exists "Signed-in players can view profiles" on public.profiles;
create policy "Signed-in players can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Players can create their own profile" on public.profiles;
create policy "Players can create their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Players can update their own profile" on public.profiles;
create policy "Players can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select, insert, update on public.profiles to authenticated;
