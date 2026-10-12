create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  username text not null,
  role text check (role in ('admin', 'client', 'worker', 'cutting', 'sewing')),
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

create or replace function public.is_active_factory_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

create or replace function public.create_pending_factory_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_username text;
  profile_name text;
begin
  profile_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(new.email, '@', 1)
  );
  profile_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    profile_username
  );

  if lower(profile_username) = 'zero0'
    and lower(new.email) <> 'zero0@accounts.al-motamayez.invalid' then
    raise exception 'This username is reserved.';
  end if;

  insert into public.profiles (id, full_name, username, role, status)
  values (new.id, profile_name, profile_username, null, 'pending');
  return new;
end;
$$;

drop trigger if exists create_pending_factory_profile on auth.users;
create trigger create_pending_factory_profile
  after insert on auth.users
  for each row execute procedure public.create_pending_factory_profile();

alter table public.profiles enable row level security;

drop policy if exists "Users read own profile or admins read all" on public.profiles;
create policy "Users read own profile or admins read all"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_active_factory_admin());

drop policy if exists "Admins activate accounts" on public.profiles;
create policy "Admins activate accounts"
  on public.profiles
  for update
  to authenticated
  using (public.is_active_factory_admin())
  with check (public.is_active_factory_admin());

grant select, update on public.profiles to authenticated;
grant execute on function public.is_active_factory_admin() to authenticated;

-- Create this Auth user in Supabase first, with email auto-confirmed:
--   email: zero0@accounts.al-motamayez.invalid
-- Then run this statement to promote the account to the first admin.
update public.profiles as profile
set full_name = 'ZERO0',
    username = 'ZERO0',
    role = 'admin',
    status = 'active',
    updated_at = now()
from auth.users as auth_user
where profile.id = auth_user.id
  and lower(auth_user.email) = 'zero0@accounts.al-motamayez.invalid';
