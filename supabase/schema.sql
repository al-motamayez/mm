-- One-time Supabase setup for the factory application.
-- Run this complete file in the Supabase SQL Editor; do not disable RLS.
-- A legacy public.users.password column is removed; non-secret profile fields
-- are retained in a private archive and matched Auth profiles are migrated.

do $$
begin
  if to_regclass('public.users') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'users'
        and column_name = 'password'
    ) then
    if to_regclass('public.users_legacy_profiles') is not null then
      raise exception 'Both public.users with a plaintext password and public.users_legacy_profiles exist. Review the existing archive before retrying setup.';
    end if;

    execute 'alter table public.users rename to users_legacy_profiles';
    execute 'alter table public.users_legacy_profiles drop column password';
    execute 'alter table public.users_legacy_profiles enable row level security';
    execute 'revoke all on table public.users_legacy_profiles from public, anon, authenticated';
  end if;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  username text not null,
  role text check (role in ('admin', 'client', 'worker', 'cutting', 'sewing')),
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_name_not_blank check (length(trim(name)) > 0),
  constraint users_username_format check (username ~ '^[A-Za-z0-9._-]{3,30}$')
);

alter table public.users add column if not exists phone text;
alter table public.users add column if not exists email text;
alter table public.users drop constraint if exists users_status_check;
alter table public.users add constraint users_status_check
  check (status in ('pending', 'active', 'suspended'));

-- Move profiles that can be linked safely to an existing Supabase Auth user.
-- Unmatched profiles remain in the private archive without their old password.
do $$
begin
  if to_regclass('public.users_legacy_profiles') is not null then
    execute $migration$
      insert into public.users (id, name, username, role, status, created_at)
      select distinct on (lower(trim(legacy.username)))
        auth_user.id,
        coalesce(nullif(trim(legacy.name), ''), trim(legacy.username)),
        trim(legacy.username),
        case lower(trim(legacy.role))
          when 'admin' then 'admin'
          when 'client' then 'client'
          when 'worker' then 'worker'
          when 'cutting' then 'cutting'
          when 'sewing' then 'sewing'
          else null
        end,
        case
          when lower(trim(legacy.role)) in ('admin', 'client', 'worker', 'cutting', 'sewing') then 'active'
          else 'pending'
        end,
        coalesce(legacy.created_at, now())
      from public.users_legacy_profiles as legacy
      join lateral (
        select candidate.id
        from auth.users as candidate
        where lower(candidate.email) =
          case
            when lower(trim(legacy.username)) = 'zero0' then 'mohamed01007033454@gmail.com'
            else lower(trim(legacy.username)) || '@accounts.al-motamayez.invalid'
          end
          or (
            lower(trim(legacy.username)) = 'zero0'
            and lower(candidate.email) = 'zero0@accounts.al-motamayez.invalid'
          )
        order by case
          when lower(candidate.email) = 'mohamed01007033454@gmail.com' then 0
          else 1
        end
        limit 1
      ) as auth_user on true
      where trim(legacy.username) ~ '^[A-Za-z0-9._-]{3,30}$'
      order by lower(trim(legacy.username)),
        case when lower(trim(legacy.role)) = 'admin' then 0 else 1 end,
        legacy.created_at nulls last
      on conflict do nothing
    $migration$;
  end if;
end;
$$;

create unique index if not exists users_username_lower_unique
  on public.users (lower(username));

create or replace function public.is_active_factory_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

create or replace function public.ensure_factory_admin_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_email text;
begin
  select lower(trim(auth_user.email))
    into auth_email
  from auth.users as auth_user
  where auth_user.id = auth.uid()
    and auth_user.email_confirmed_at is not null;

  if auth_email is distinct from 'mohamed01007033454@gmail.com' then
    raise exception 'Only the verified factory administrator may initialize this profile.';
  end if;

  insert into public.users (id, name, username, email, role, status)
  values (auth.uid(), 'ZERO0', 'ZERO0', auth_email, 'admin', 'active')
  on conflict (id) do update
  set name = excluded.name,
      username = excluded.username,
      email = excluded.email,
      role = excluded.role,
      status = excluded.status,
      updated_at = now();
end;
$$;

create table if not exists public.factory_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  brand_name text not null default '',
  code_letter text not null default '',
  client_number text not null default '',
  phone text not null default '',
  cash_phone text not null default '',
  instagram text not null default '',
  whatsapp text not null default '',
  notes text not null default '',
  account_period_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.factory_client_model_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.factory_clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  model_name text,
  model_number text,
  quantity integer check (quantity is null or quantity >= 0),
  notes text not null default '',
  image_path text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  check (model_name is null or length(model_name) <= 160),
  check (model_number is null or length(model_number) <= 100),
  check (length(notes) <= 2000)
);

create index if not exists factory_client_model_requests_created_at_idx
  on public.factory_client_model_requests (created_at desc);

alter table public.factory_clients
  add column if not exists brand_name text not null default '',
  add column if not exists code_letter text not null default '',
  add column if not exists client_number text not null default '',
  add column if not exists cash_phone text not null default '',
  add column if not exists instagram text not null default '',
  add column if not exists whatsapp text not null default '',
  add column if not exists account_period_started_at timestamptz;
update public.factory_clients
set code_letter = upper(trim(code_letter))
where length(trim(code_letter)) > 0
  and code_letter is distinct from upper(trim(code_letter));

create sequence if not exists public.factory_client_code_letter_seq;
create or replace function public.factory_code_letter(sequence_value bigint)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  value bigint := sequence_value;
  result text := '';
begin
  if value < 1 then
    raise exception 'A positive sequence value is required.';
  end if;
  while value > 0 loop
    value := value - 1;
    result := chr(65 + (value % 26)::integer) || result;
    value := value / 26;
  end loop;
  return result;
end;
$$;

do $$
declare
  client_record record;
  candidate_letter text;
begin
  for client_record in
    select id
    from public.factory_clients
    where length(trim(code_letter)) = 0
    order by created_at, id
  loop
    loop
      candidate_letter := public.factory_code_letter(
        nextval('public.factory_client_code_letter_seq')
      );
      exit when not exists (
        select 1
        from public.factory_clients
        where code_letter = candidate_letter
          and id is distinct from client_record.id
      );
    end loop;
    update public.factory_clients
    set code_letter = candidate_letter
    where id = client_record.id;
  end loop;
end;
$$;

select setval(
  'public.factory_client_code_letter_seq',
  greatest((select count(*) from public.factory_clients), 1),
  (select count(*) > 0 from public.factory_clients)
);

create or replace function public.assign_factory_client_code_letter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(coalesce(new.code_letter, ''))) = 0 then
    loop
      new.code_letter := public.factory_code_letter(nextval('public.factory_client_code_letter_seq'));
      exit when not exists (
        select 1 from public.factory_clients
        where code_letter = new.code_letter
          and id is distinct from new.id
      );
    end loop;
  else
    new.code_letter := upper(trim(new.code_letter));
  end if;
  if new.code_letter !~ '^[A-Z]+$' then
    raise exception 'Client code letter must contain only English letters.';
  end if;
  return new;
end;
$$;

drop trigger if exists assign_factory_client_code_letter on public.factory_clients;
create trigger assign_factory_client_code_letter
  before insert or update of code_letter on public.factory_clients
  for each row execute procedure public.assign_factory_client_code_letter();

create unique index if not exists factory_clients_code_letter_idx
  on public.factory_clients (code_letter);

create or replace function public.refresh_factory_model_codes_for_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code_letter is distinct from old.code_letter then
    update public.orders
    set factory_model_code = concat(new.code_letter, '-', model_serial)
    where customer_id = new.id
      and model_serial is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_factory_model_codes_for_client on public.factory_clients;
create trigger refresh_factory_model_codes_for_client
  after update of code_letter on public.factory_clients
  for each row execute procedure public.refresh_factory_model_codes_for_client();

create or replace function public.sync_factory_client_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'client' and new.status = 'active' then
    if tg_op = 'UPDATE' then
      update public.factory_clients
      set name = case when name = old.name then new.name else name end,
          phone = case when phone = coalesce(old.phone, '') then coalesce(new.phone, '') else phone end,
          updated_at = now()
      where user_id = new.id;
    end if;
    if not exists (
      select 1 from public.factory_clients where user_id = new.id
    ) then
      insert into public.factory_clients (user_id, name, phone)
      values (new.id, new.name, coalesce(new.phone, ''))
      on conflict (user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_factory_client_profile on public.users;
create trigger sync_factory_client_profile
  after insert or update of name, phone, role, status on public.users
  for each row execute procedure public.sync_factory_client_profile();

insert into public.factory_clients (user_id, name, phone)
select account.id, account.name, coalesce(account.phone, '')
from public.users as account
where account.role = 'client'
  and account.status = 'active'
on conflict (user_id) do update
  set name = excluded.name,
      phone = excluded.phone,
      updated_at = now();

create or replace function public.admin_link_factory_client_account(
  requested_customer_id uuid,
  requested_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user public.users%rowtype;
  target_customer public.factory_clients%rowtype;
  current_customer_id uuid;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only an active factory admin may link client accounts.';
  end if;
  if requested_user_id is null then
    raise exception 'Choose a login account to link.';
  end if;

  select *
    into target_user
  from public.users
  where id = requested_user_id
  for update;
  if not found then
    raise exception 'The requested login account does not exist.';
  end if;
  if not (
    (target_user.status = 'pending' and target_user.role is null)
    or (target_user.status = 'active' and target_user.role = 'client')
  ) then
    raise exception 'Only pending registrations or active client accounts can be linked.';
  end if;

  select id
    into current_customer_id
  from public.factory_clients
  where user_id = requested_user_id
  for update;
  if found and current_customer_id is distinct from requested_customer_id then
    raise exception 'This login is already linked to another client profile.';
  end if;

  if requested_customer_id is null then
    if target_user.status <> 'pending' or target_user.role is not null or current_customer_id is not null then
      raise exception 'A new client profile can only be created for an unlinked pending registration.';
    end if;
    update public.users
    set role = 'client',
        status = 'active',
        updated_at = now()
    where id = requested_user_id
      and status = 'pending'
      and role is null;
    if not found then
      raise exception 'The registration is no longer pending.';
    end if;
    return;
  end if;

  select *
    into target_customer
  from public.factory_clients
  where id = requested_customer_id
  for update;
  if not found then
    raise exception 'The selected client profile does not exist.';
  end if;
  if target_customer.user_id is not null and target_customer.user_id <> requested_user_id then
    raise exception 'The selected client profile is already linked to another login.';
  end if;

  update public.factory_clients
  set user_id = requested_user_id,
      updated_at = now()
  where id = requested_customer_id;

  update public.orders
  set client_id = requested_user_id
  where customer_id = requested_customer_id
    and client_id is distinct from requested_user_id;

  update public.factory_records
  set owner_id = requested_user_id
  where collection in ('payments', 'settlements')
    and owner_id is distinct from requested_user_id
    and (
      payload ->> 'customerId' = requested_customer_id::text
      or payload ->> 'customer_id' = requested_customer_id::text
      or payload ->> 'clientId' = requested_customer_id::text
      or payload ->> 'client_id' = requested_customer_id::text
    );

  update public.factory_client_model_requests
  set user_id = requested_user_id
  where client_id = requested_customer_id
    and user_id is distinct from requested_user_id;

  update public.users
  set role = 'client',
      status = 'active',
      updated_at = now()
  where id = requested_user_id
    and (
      (status = 'pending' and role is null)
      or (status = 'active' and role = 'client')
    );
  if not found then
    raise exception 'The registration changed before it could be linked.';
  end if;
end;
$$;

create or replace function public.delete_user_by_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only an active factory admin may delete user profiles.';
  end if;
  if target_user_id is null or target_user_id = auth.uid() then
    raise exception 'The current account cannot be deleted through this action.';
  end if;

  select account.role
    into target_role
  from public.users as account
  where account.id = target_user_id
  for update;

  if not found then
    raise exception 'The requested user profile does not exist.';
  end if;
  if target_role = 'admin' then
    raise exception 'Admin accounts cannot be deleted through this action.';
  end if;

  delete from public.users as account
  where account.id = target_user_id;
  if not found then
    raise exception 'The requested user profile was not deleted.';
  end if;
end;
$$;

revoke all on function public.delete_user_by_admin(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_by_admin(uuid) to authenticated;

create or replace function public.create_pending_factory_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_username text;
  user_name text;
  user_phone text;
  user_email text;
begin
  user_email := lower(trim(new.email));
  user_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(new.email, '@', 1)
  );
  user_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    user_username
  );
  user_phone := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');

  if lower(user_username) = 'zero0'
    and lower(new.email) not in (
      'zero0@accounts.al-motamayez.invalid',
      'mohamed01007033454@gmail.com'
    ) then
    raise exception 'This username is reserved.';
  end if;

  insert into public.users (id, name, username, email, phone, role, status)
  values (new.id, user_name, user_username, user_email, user_phone, null, 'pending');
  return new;
end;
$$;

drop trigger if exists create_pending_factory_profile on auth.users;
drop trigger if exists create_pending_factory_user on auth.users;
create trigger create_pending_factory_user
  after insert on auth.users
  for each row execute procedure public.create_pending_factory_user();

create or replace function public.sync_factory_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set email = lower(trim(new.email)),
      updated_at = now()
  where id = new.id
    and email is distinct from lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists sync_factory_user_email on auth.users;
create trigger sync_factory_user_email
  after update of email on auth.users
  for each row execute procedure public.sync_factory_user_email();

-- Preserve profiles created by the earlier schema without moving credentials.
do $$
begin
  if to_regclass('public.profiles') is not null then
    execute $migration$
      insert into public.users (id, name, username, role, status, created_at, updated_at)
      select id, full_name, username, role, status, created_at, updated_at
      from public.profiles
      on conflict (id) do nothing
    $migration$;
  end if;
end;
$$;

update public.users as account
set email = auth_user.email
from auth.users as auth_user
where account.id = auth_user.id
  and account.email is distinct from auth_user.email;

alter table public.users enable row level security;

drop policy if exists "Users read own profile or admins read all" on public.users;
drop policy if exists "Users read own account or admins read all" on public.users;
create policy "Users read own account or admins read all"
  on public.users
  for select
  to authenticated
  using (id = auth.uid() or public.is_active_factory_admin());

drop policy if exists "Users create own pending account" on public.users;
create policy "Users create own pending account"
  on public.users
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and role is null
    and status = 'pending'
    and lower(trim(coalesce(email, ''))) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "Admins activate accounts" on public.users;
create policy "Admins activate accounts"
  on public.users
  for update
  to authenticated
  using (public.is_active_factory_admin() and role is distinct from 'admin')
  with check (public.is_active_factory_admin() and role is distinct from 'admin');

drop policy if exists "Admins delete non-admin accounts" on public.users;

revoke all on public.users from anon, authenticated;
grant select, update on public.users to authenticated;
revoke delete on public.users from authenticated;
grant insert (id, name, username, email, phone, role, status) on public.users to authenticated;
revoke all on function public.is_active_factory_admin() from public, anon, authenticated;
grant execute on function public.is_active_factory_admin() to authenticated;
revoke all on function public.ensure_factory_admin_profile() from public, anon, authenticated;
grant execute on function public.ensure_factory_admin_profile() to authenticated;
revoke all on function public.delete_user_by_admin(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_by_admin(uuid) to authenticated;
revoke all on function public.admin_link_factory_client_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_link_factory_client_account(uuid, uuid) to authenticated;
revoke all on function public.create_pending_factory_user() from public, anon, authenticated;
revoke all on function public.sync_factory_user_email() from public, anon, authenticated;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references auth.users (id) on delete set null,
  customer_id uuid references public.factory_clients (id) on delete set null,
  model_name text,
  model_number text not null default '',
  model_serial bigint,
  factory_model_code text,
  client_model_code text not null default '',
  sender_name text,
  original_total_pieces integer not null default 0 check (original_total_pieces >= 0),
  total_pieces integer not null default 0 check (total_pieces >= 0),
  status text not null default 'قيد الانتظار',
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists client_id uuid references auth.users (id) on delete set null,
  add column if not exists customer_id uuid references public.factory_clients (id) on delete set null;

do $$
declare
  foreign_key_name text;
begin
  for foreign_key_name in
    select constraint_row.conname
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.orders'::regclass
      and constraint_row.contype = 'f'
      and exists (
        select 1
        from unnest(constraint_row.conkey) as constrained_column(attnum)
        join pg_attribute as column_info
          on column_info.attrelid = constraint_row.conrelid
         and column_info.attnum = constrained_column.attnum
        where column_info.attname = 'client_id'
      )
  loop
    execute format('alter table public.orders drop constraint %I', foreign_key_name);
  end loop;
end;
$$;

alter table public.orders
  add constraint orders_client_id_fkey
    foreign key (client_id) references auth.users (id) on delete set null;

alter table public.orders
  add column if not exists model_name text,
  add column if not exists model_number text not null default '',
  add column if not exists model_serial bigint,
  add column if not exists factory_model_code text,
  add column if not exists parent_order_id uuid references public.orders (id) on delete set null,
  add column if not exists client_model_code text not null default '',
  add column if not exists sender_name text,
  add column if not exists original_total_pieces integer,
  add column if not exists colors text not null default '',
  add column if not exists color_names jsonb not null default '{}'::jsonb,
  add column if not exists sizes text not null default '',
  add column if not exists total_pieces integer not null default 0,
  add column if not exists delivered_pieces integer not null default 0,
  add column if not exists price_per_piece numeric(12, 2) not null default 0,
  add column if not exists paid_amount numeric(12, 2) not null default 0,
  add column if not exists operational_expenses numeric(14, 2) not null default 0,
  add column if not exists expected_delivery_date date,
  add column if not exists model_image_url text,
  add column if not exists model_image_url_2 text,
  add column if not exists priority text not null default 'عادي',
  add column if not exists production_type text not null default 'full_cutting',
  add column if not exists work_stages text[] not null default array['cutting', 'sewing', 'finishing']::text[],
  add column if not exists pricing_mode text not null default 'total',
  add column if not exists stage_prices jsonb not null default '{}'::jsonb,
  add column if not exists color_size_distribution jsonb not null default '{"colors":[]}'::jsonb,
  add column if not exists archived_at timestamptz;

update public.orders
set client_model_code = trim(model_number)
where length(trim(coalesce(client_model_code, ''))) = 0
  and length(trim(coalesce(model_number, ''))) > 0;

create sequence if not exists public.factory_model_serial_seq;
with numbered_orders as (
  select id,
         row_number() over (order by created_at, id)
           + coalesce((select max(model_serial) from public.orders), 0) as sequence_value
  from public.orders
  where model_serial is null
)
update public.orders as factory_order
set model_serial = numbered_orders.sequence_value
from numbered_orders
where factory_order.id = numbered_orders.id;

select setval(
  'public.factory_model_serial_seq',
  greatest(coalesce((select max(model_serial) from public.orders), 1), 1),
  (select max(model_serial) is not null from public.orders)
);

update public.orders as factory_order
set factory_model_code = concat(client.code_letter, '-', factory_order.model_serial)
from public.factory_clients as client
where client.id = factory_order.customer_id
  and (factory_order.factory_model_code is null or length(trim(factory_order.factory_model_code)) = 0);

drop index if exists public.orders_model_serial_idx;
drop index if exists public.orders_factory_model_code_idx;
create index if not exists orders_model_serial_idx
  on public.orders (model_serial) where model_serial is not null;
create index if not exists orders_factory_model_code_idx
  on public.orders (factory_model_code) where factory_model_code is not null;

create or replace function public.assign_factory_model_serial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_letter text;
  parent_model public.orders%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.parent_order_id is not null then
      select * into parent_model
      from public.orders
      where id = new.parent_order_id
      for key share;
      if not found or parent_model.model_serial is null or parent_model.factory_model_code is null then
        raise exception 'The source model for this cutting replication no longer exists.';
      end if;
      new.model_serial := parent_model.model_serial;
      new.factory_model_code := parent_model.factory_model_code;
      new.parent_order_id := coalesce(parent_model.parent_order_id, parent_model.id);
    else
      if new.model_serial is null then
        new.model_serial := nextval('public.factory_model_serial_seq');
      end if;
      if new.customer_id is not null then
        select code_letter into customer_letter
        from public.factory_clients
        where id = new.customer_id;
        if not found then
          raise exception 'The selected factory customer does not exist.';
        end if;
        new.factory_model_code := concat(customer_letter, '-', new.model_serial);
      end if;
    end if;
  end if;
  new.client_model_code := coalesce(trim(new.client_model_code), '');
  return new;
end;
$$;

drop trigger if exists assign_factory_model_serial on public.orders;
create trigger assign_factory_model_serial
  before insert or update of customer_id, model_serial, client_model_code on public.orders
  for each row execute procedure public.assign_factory_model_serial();

alter table public.orders
  drop column if exists remaining_amount,
  drop column if exists total_amount,
  drop column if exists expected_total_amount;

alter table public.orders
  drop constraint if exists orders_production_type_check,
  add constraint orders_production_type_check
    check (production_type in ('full_cutting', 'ready_sewing')),
  drop constraint if exists orders_work_stages_check,
  add constraint orders_work_stages_check
    check (
      cardinality(work_stages) > 0
      and work_stages <@ array['cutting', 'sewing', 'finishing', 'ironing', 'printing', 'packaging', 'sorting']::text[]
    ),
  drop constraint if exists orders_pricing_mode_check,
  add constraint orders_pricing_mode_check
    check (pricing_mode in ('total', 'stages')),
  drop constraint if exists orders_stage_prices_check,
  add constraint orders_stage_prices_check
    check (jsonb_typeof(stage_prices) = 'object'),
  drop constraint if exists orders_operational_expenses_check,
  add constraint orders_operational_expenses_check
    check (operational_expenses >= 0);

alter table public.orders
  add column total_amount numeric(14, 2)
    generated always as (
      delivered_pieces * price_per_piece
      + case when delivered_pieces > 0 then operational_expenses else 0 end
    ) stored,
  add column expected_total_amount numeric(14, 2)
    generated always as (
      greatest(total_pieces - delivered_pieces, 0) * price_per_piece
      + case when delivered_pieces = 0 then operational_expenses else 0 end
    ) stored,
  add column remaining_amount numeric(14, 2)
    generated always as (
      delivered_pieces * price_per_piece
      + case when delivered_pieces > 0 then operational_expenses else 0 end
      - paid_amount
    ) stored;

create table if not exists public.production_stages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  stage_name text not null check (stage_name in ('cutting', 'sewing', 'finishing', 'ironing', 'printing', 'packaging', 'sorting', 'delivery')),
  worker_id uuid references auth.users (id) on delete set null,
  worker_name text,
  fabric text,
  fabric_details text not null default '',
  external_fabric_source text not null default '',
  external_fabric_unit text not null default '',
  bolt_count integer not null default 0 check (bolt_count >= 0),
  layer_count integer not null default 0 check (layer_count >= 0),
  color_ply_data jsonb not null default '{}'::jsonb,
  technical_notes text not null default '',
  line_name text,
  target_quantity integer not null default 0 check (target_quantity >= 0),
  completed_quantity integer not null default 0 check (completed_quantity >= 0 and completed_quantity <= target_quantity),
  status text not null default 'معلق',
  updated_at timestamptz not null default now(),
  unique (order_id, stage_name)
);

alter table public.production_stages
  add column if not exists worker_id uuid references auth.users (id) on delete set null,
  add column if not exists cutter_name text not null default '',
  add column if not exists fabric text,
  add column if not exists fabric_details text not null default '',
  add column if not exists external_fabric_source text not null default '',
  add column if not exists external_fabric_unit text not null default '',
  add column if not exists fabric_id uuid,
  add column if not exists fabric_quantity numeric(14, 3) not null default 0 check (fabric_quantity >= 0),
  add column if not exists bolt_count integer not null default 0,
  add column if not exists layer_count integer not null default 0,
  add column if not exists color_ply_data jsonb not null default '{}'::jsonb,
  add column if not exists technical_notes text not null default '',
  add column if not exists line_name text,
  add column if not exists target_quantity integer not null default 0,
  add column if not exists completed_quantity integer not null default 0;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

drop function if exists public.read_factory_cutting_drafts();
drop function if exists public.save_factory_cutting_draft(uuid, jsonb);
drop function if exists public.delete_factory_cutting_draft(uuid);
do $$
begin
  if to_regclass('public.factory_cutting_drafts') is not null then
    execute 'revoke all on table public.factory_cutting_drafts from public, anon, authenticated';
    execute 'alter table public.factory_cutting_drafts enable row level security';
  end if;
end;
$$;

create table if not exists private.orphaned_production_stages (
  stage_id uuid primary key,
  order_id uuid not null,
  archived_at timestamptz not null default now(),
  stage_data jsonb not null
);

revoke all on table private.orphaned_production_stages from public, anon, authenticated;

insert into private.orphaned_production_stages (stage_id, order_id, stage_data)
select stage.id, stage.order_id, to_jsonb(stage)
from public.production_stages as stage
where not exists (
  select 1
  from public.orders as factory_order
  where factory_order.id = stage.order_id
)
on conflict (stage_id) do nothing;

delete from public.production_stages as stage
where not exists (
  select 1
  from public.orders as factory_order
  where factory_order.id = stage.order_id
);

alter table public.production_stages
  drop constraint if exists production_stages_order_id_fkey,
  add constraint production_stages_order_id_fkey
    foreign key (order_id) references public.orders (id) on delete cascade;

update public.production_stages
set stage_name = case lower(trim(stage_name))
  when 'تقطيع' then 'cutting'
  when 'قص' then 'cutting'
  when 'خياطة' then 'sewing'
  when 'تشطيب' then 'finishing'
  when 'طباعة' then 'printing'
  when 'فرز' then 'sorting'
  when 'تسليم' then 'delivery'
  else stage_name
end
where lower(trim(stage_name)) in ('تقطيع', 'قص', 'خياطة', 'تشطيب', 'طباعة', 'فرز', 'تسليم');

alter table public.production_stages
  drop constraint if exists production_stages_stage_name_check,
  add constraint production_stages_stage_name_check
    check (stage_name in ('cutting', 'sewing', 'finishing', 'ironing', 'printing', 'packaging', 'sorting', 'delivery'));

update public.production_stages as stage
set target_quantity = greatest(factory_order.total_pieces, stage.completed_quantity)
from public.orders as factory_order
where stage.order_id = factory_order.id
  and stage.target_quantity = 0;

update public.production_stages
set target_quantity = completed_quantity
where target_quantity < completed_quantity;

alter table public.orders
  drop constraint if exists orders_total_pieces_positive,
  drop constraint if exists orders_total_pieces_check,
  drop constraint if exists orders_original_total_pieces_check,
  drop constraint if exists orders_delivered_pieces_range,
  drop constraint if exists orders_delivered_pieces_nonnegative,
  drop constraint if exists orders_amounts_range,
  drop constraint if exists orders_paid_amount_nonnegative,
  drop constraint if exists orders_factory_status_check;

update public.orders as factory_order
set model_name = coalesce(
      nullif(trim(factory_order.model_name), ''),
      nullif(trim(factory_order.model_number), ''),
      'موديل'
    ),
    model_number = coalesce(nullif(trim(factory_order.model_number), ''), ''),
    total_pieces = greatest(coalesce(factory_order.total_pieces, 0), 0),
    original_total_pieces = coalesce(
      factory_order.original_total_pieces,
      greatest(coalesce(factory_order.total_pieces, 0), 0)
    ),
    price_per_piece = greatest(coalesce(factory_order.price_per_piece, 0), 0),
    paid_amount = greatest(coalesce(factory_order.paid_amount, 0), 0),
    delivered_pieces = greatest(
      coalesce(factory_order.delivered_pieces, 0),
      greatest(coalesce((
        select stage.completed_quantity
        from public.production_stages as stage
        where stage.order_id = factory_order.id
          and stage.stage_name = 'delivery'
        limit 1
      ), 0), 0)
    ),
    status = case trim(factory_order.status)
      when 'تم التسليم' then 'تم التسليم'
      when 'تم التسليم والإغلاق' then 'تم التسليم'
      when 'تم التسليم بالكامل' then 'تم التسليم'
      when 'مكتمل' then case
        when coalesce(factory_order.delivered_pieces, 0) >= greatest(coalesce(factory_order.total_pieces, 0), 0)
          and coalesce(factory_order.total_pieces, 0) > 0
          then 'تم التسليم'
        else 'تمت الخياطة'
      end
      when 'تم الانتهاء' then 'تم التسليم'
      when 'جاهز للتسليم' then 'جاهز للتسليم'
      when 'قيد الانتظار' then 'قيد الانتظار'
      when 'معلق' then 'قيد الانتظار'
      when 'تحت الإنشاء' then 'قيد الانتظار'
      when 'قيد الفرش' then 'قيد الفرش'
      when 'تم الفرش' then 'تم الفرش'
      when 'جاهز للقص' then 'جاهز للقص'
      when 'تم الفرش / جاهز للقص' then 'جاهز للقص'
      when 'تم القص' then 'تم القص'
      when 'في انتظار الخياطة' then 'في انتظار الخياطة'
      when 'معلق - في انتظار الخياطة' then 'في انتظار الخياطة'
      when 'في الخياطة' then 'جاري الخياطة'
      when 'جاري الخياطة' then 'جاري الخياطة'
      when 'تمت الخياطة' then 'تمت الخياطة'
      when 'جاري التشطيب' then 'جاري التشطيب'
      when 'تم التشطيب' then 'تم التشطيب'
      when 'جاري المكواة' then 'جاري المكواة'
      when 'تم الكي' then 'تم الكي'
      when 'جاري الطباعة' then 'جاري الطباعة'
      when 'تمت الطباعة' then 'تمت الطباعة'
      when 'جاري التكييس' then 'جاري التكييس'
      when 'تم التكييس' then 'تم التكييس'
      when 'جاري الفرز' then 'جاري الفرز'
      when 'تم الفرز' then 'تم الفرز'
      when 'متاح للإمبلاج / التعبئة' then 'تمت الخياطة'
      when 'في الخط' then 'جاري الخياطة'
      when 'تحت التصنيع' then 'قيد الفرش'
      when 'قيد الإنتاج' then 'قيد الفرش'
      else 'قيد الانتظار'
    end;

alter table public.orders
  alter column total_pieces set default 0,
  alter column total_pieces set not null,
  alter column original_total_pieces set default 0,
  alter column original_total_pieces set not null,
  alter column delivered_pieces set default 0,
  alter column delivered_pieces set not null,
  alter column price_per_piece set default 0,
  alter column price_per_piece set not null,
  alter column paid_amount set default 0,
  alter column paid_amount set not null,
  alter column model_name drop not null;

alter table public.orders
  alter column status set default 'قيد الانتظار';
alter table public.orders
  add constraint orders_total_pieces_check check (total_pieces >= 0),
  add constraint orders_original_total_pieces_check check (original_total_pieces >= 0),
  add constraint orders_delivered_pieces_nonnegative check (delivered_pieces >= 0),
  add constraint orders_paid_amount_nonnegative check (paid_amount >= 0),
  add constraint orders_factory_status_check check (
    status in (
      'قيد الانتظار', 'قيد الفرش', 'تم الفرش', 'جاهز للقص', 'تم القص',
      'في انتظار الخياطة', 'جاري الخياطة', 'تمت الخياطة', 'جاري التشطيب', 'تم التشطيب',
      'جاري المكواة', 'تم الكي', 'جاري الطباعة', 'تمت الطباعة',
      'جاري التكييس', 'تم التكييس', 'جاري الفرز', 'تم الفرز', 'مكتمل', 'جاهز للتسليم', 'تم التسليم'
    )
  );

update public.orders as factory_order
set status = 'في انتظار الخياطة'
where factory_order.status = 'جاري الخياطة'
  and exists (
    select 1
    from public.production_stages as sewing_stage
    where sewing_stage.order_id = factory_order.id
      and sewing_stage.stage_name = 'sewing'
      and sewing_stage.status = 'متاح للخياطة'
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.production_stages'::regclass
      and conname = 'production_stages_completed_not_over_target'
  ) then
    alter table public.production_stages
      add constraint production_stages_completed_not_over_target
      check (completed_quantity <= target_quantity);
  end if;
end;
$$;

update public.orders as factory_order
set customer_id = customer.id
from public.factory_clients as customer
where factory_order.customer_id is null
  and customer.user_id = factory_order.client_id;

create or replace function public.create_factory_order_stages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.production_stages (order_id, stage_name, target_quantity)
  select new.id, selected_stage.stage_name, new.total_pieces
  from unnest(new.work_stages || array['delivery']::text[]) as selected_stage(stage_name);
  return new;
end;
$$;

drop trigger if exists create_factory_order_stages on public.orders;
create trigger create_factory_order_stages
  after insert on public.orders
  for each row execute procedure public.create_factory_order_stages();

insert into public.production_stages (order_id, stage_name, target_quantity)
select factory_order.id, stage.stage_name, factory_order.total_pieces
from public.orders as factory_order
cross join lateral unnest(factory_order.work_stages || array['delivery']::text[]) as stage(stage_name)
where not exists (
  select 1
  from public.production_stages as existing_stage
  where existing_stage.order_id = factory_order.id
    and existing_stage.stage_name = stage.stage_name
);

drop function if exists public.save_factory_order(uuid, text, text, integer, text);
drop function if exists public.save_factory_order(uuid, text, text, integer, text, text, text);
drop function if exists public.save_factory_order(uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric);

create or replace function public.read_factory_orders_admin()
returns setof public.orders
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can read financial order details.';
  end if;

  return query
    select factory_order.*
    from public.orders as factory_order
    order by factory_order.created_at desc;
end;
$$;

drop function if exists public.read_factory_orders_client();
create function public.read_factory_orders_client()
returns table (
  id uuid,
  client_id uuid,
  customer_id uuid,
  model_name text,
  model_number text,
  model_serial bigint,
  factory_model_code text,
  client_model_code text,
  production_type text,
  work_stages text[],
  sender_name text,
  colors text,
  color_size_distribution jsonb,
  color_names jsonb,
  sizes text,
  original_total_pieces integer,
  total_pieces integer,
  delivered_pieces integer,
  archived_at timestamptz,
  expected_delivery_date date,
  model_image_url text,
  model_image_url_2 text,
  price_per_piece numeric,
  operational_expenses numeric,
  total_amount numeric,
  expected_total_amount numeric,
  paid_amount numeric,
  remaining_amount numeric,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_active_factory_role(array['client']) then
    raise exception 'Only active clients can read their order totals.';
  end if;

  return query
    select factory_order.id,
           factory_order.client_id,
           factory_order.customer_id,
           factory_order.model_name,
           factory_order.model_number,
           factory_order.model_serial,
           factory_order.factory_model_code,
           factory_order.client_model_code,
           factory_order.production_type,
           factory_order.work_stages,
           factory_order.sender_name,
           factory_order.colors,
           factory_order.color_size_distribution,
           factory_order.color_names,
           factory_order.sizes,
           factory_order.original_total_pieces,
           factory_order.total_pieces,
           factory_order.delivered_pieces,
           factory_order.archived_at,
           factory_order.expected_delivery_date,
           factory_order.model_image_url,
           factory_order.model_image_url_2,
           factory_order.price_per_piece,
           factory_order.operational_expenses,
           factory_order.total_amount,
           factory_order.expected_total_amount,
           factory_order.paid_amount,
           factory_order.remaining_amount,
           factory_order.status,
           factory_order.created_at
    from public.orders as factory_order
    where factory_order.client_id = auth.uid()
       or public.owns_factory_client_profile(factory_order.customer_id)
    order by factory_order.created_at desc;
end;
$$;

drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text, jsonb);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text, jsonb, text, jsonb);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text, jsonb, text, jsonb, text[], text, jsonb);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text, jsonb, text, jsonb, text[], text, jsonb, numeric);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text, jsonb, text, jsonb, text[], text, jsonb, numeric);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text, jsonb, text, jsonb, text[], text, jsonb, numeric, text);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text, jsonb, text, jsonb, text[], text, jsonb, numeric, text, text);
create function public.save_factory_order(
  requested_order_id uuid,
  requested_customer_id uuid,
  requested_model_name text,
  requested_model_number text,
  requested_quantity integer,
  requested_original_quantity integer,
  requested_status text,
  requested_fabric text,
  requested_line_name text,
  requested_colors text,
  requested_sizes text,
  requested_delivered_pieces integer,
  requested_price_per_piece numeric,
  requested_paid_amount numeric,
  requested_expected_delivery_date date,
  requested_model_image_url text,
  requested_priority text,
  requested_color_names jsonb,
  requested_production_type text,
  requested_color_size_distribution jsonb,
  requested_work_stages text[],
  requested_pricing_mode text,
  requested_stage_prices jsonb,
  requested_operational_expenses numeric,
  requested_client_model_code text,
  requested_model_image_url_2 text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_order_id uuid;
  matched_customer_id uuid;
  current_customer_id uuid;
  current_price_per_piece numeric;
  current_status text;
  current_total_pieces integer;
  matched_client_id uuid;
  resolved_model_name text;
  normalized_color_names jsonb;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can create or edit factory orders.';
  end if;
  if (length(trim(coalesce(requested_model_name, ''))) = 0
      and length(trim(coalesce(requested_model_number, ''))) = 0)
    or requested_customer_id is null
    or requested_quantity is null
    or requested_quantity < 0
    or requested_original_quantity is null
    or requested_original_quantity < 0
    or requested_delivered_pieces is null
    or requested_delivered_pieces < 0
    or (requested_quantity = 0 and requested_delivered_pieces > 0)
    or (
      requested_order_id is null
      and (
        (requested_delivered_pieces > 0 and requested_status is distinct from 'تم التسليم')
        or (requested_status = 'تم التسليم' and requested_delivered_pieces = 0)
      )
    )
    or requested_price_per_piece is null
    or requested_price_per_piece < 0
    or requested_price_per_piece > 9999999999.99
    or requested_paid_amount is null
    or requested_paid_amount < 0
    or requested_operational_expenses is null
    or requested_operational_expenses < 0
    or requested_operational_expenses > 999999999999.99
    or length(coalesce(requested_client_model_code, '')) > 120
    or requested_production_type is null
    or requested_production_type not in ('full_cutting', 'ready_sewing')
    or coalesce(cardinality(requested_work_stages), 0) = 0
    or not (requested_work_stages <@ array['cutting', 'sewing', 'finishing', 'ironing', 'printing', 'packaging', 'sorting']::text[])
    or cardinality(requested_work_stages) <> (
      select count(distinct selected.selected_stage)
      from unnest(requested_work_stages) as selected(selected_stage)
    )
    or requested_pricing_mode is null
    or requested_pricing_mode not in ('total', 'stages')
    or coalesce(jsonb_typeof(requested_stage_prices), '') <> 'object'
    or (requested_pricing_mode = 'total' and requested_stage_prices <> '{}'::jsonb)
    or (
      requested_pricing_mode = 'stages'
      and (
        exists (
          select 1
          from jsonb_each_text(
            case when jsonb_typeof(requested_stage_prices) = 'object'
              then requested_stage_prices else '{}'::jsonb end
          ) as stage_price(stage_name, price)
          where stage_name not in ('cutting', 'sewing', 'finishing', 'ironing', 'printing', 'packaging', 'sorting')
             or price !~ '^[0-9]+([.][0-9]{1,2})?$'
        )
        or (
          select count(*)
          from jsonb_object_keys(
            case when jsonb_typeof(requested_stage_prices) = 'object'
              then requested_stage_prices else '{}'::jsonb end
          ) as stage_price_key(key)
        ) <> cardinality(requested_work_stages)
        or exists (
          select 1
          from unnest(requested_work_stages) as selected(selected_stage)
          where not (requested_stage_prices ? selected.selected_stage)
        )
        or (
          select coalesce(sum(
            case
              when stage_price.price ~ '^[0-9]+([.][0-9]{1,2})?$'
                then stage_price.price::numeric
              else 0
            end
          ), 0)
          from jsonb_each_text(
            case when jsonb_typeof(requested_stage_prices) = 'object'
              then requested_stage_prices else '{}'::jsonb end
          ) as stage_price(stage_name, price)
        ) <> requested_price_per_piece
      )
    )
    or coalesce(jsonb_typeof(requested_color_names), '') <> 'object'
    or coalesce(jsonb_typeof(requested_color_size_distribution), '') <> 'object'
    or coalesce(jsonb_typeof(requested_color_size_distribution -> 'colors'), '') <> 'array'
    or exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(requested_color_size_distribution) = 'object'
           and jsonb_typeof(requested_color_size_distribution -> 'colors') = 'array'
            then requested_color_size_distribution -> 'colors'
          else '[]'::jsonb
        end
      ) as color_entry(value)
      where jsonb_typeof(color_entry.value) <> 'object'
         or coalesce(color_entry.value ->> 'color', '') !~ '^#[0-9A-Fa-f]{6}$'
         or length(trim(coalesce(color_entry.value ->> 'name', ''))) not between 1 and 64
         or coalesce(jsonb_typeof(color_entry.value -> 'sizes'), '') <> 'object'
         or exists (
           select 1
           from jsonb_each(
             case
               when jsonb_typeof(color_entry.value -> 'sizes') = 'object'
                 then color_entry.value -> 'sizes'
               else '{}'::jsonb
             end
           ) as size_entry(size_name, size_count)
           where coalesce(size_entry.size_count #>> '{}', '') !~ '^[0-9]+$'
         )
    )
    or (
      jsonb_array_length(
        case
          when jsonb_typeof(requested_color_size_distribution) = 'object'
           and jsonb_typeof(requested_color_size_distribution -> 'colors') = 'array'
            then requested_color_size_distribution -> 'colors'
          else '[]'::jsonb
        end
      ) > 0
      and (
        select coalesce(sum(
          case
            when size_entry.size_count #>> '{}' ~ '^[0-9]+$'
              then (size_entry.size_count #>> '{}')::numeric
            else 0
          end
        ), 0)
        from jsonb_array_elements(
          case
            when jsonb_typeof(requested_color_size_distribution) = 'object'
             and jsonb_typeof(requested_color_size_distribution -> 'colors') = 'array'
              then requested_color_size_distribution -> 'colors'
            else '[]'::jsonb
          end
        ) as color_entry(value)
        cross join lateral jsonb_each(
          case
            when jsonb_typeof(color_entry.value -> 'sizes') = 'object'
              then color_entry.value -> 'sizes'
            else '{}'::jsonb
          end
        ) as size_entry(size_name, size_count)
      ) <> requested_quantity
    )
    or exists (
      select 1
      from jsonb_each_text(
        case
          when jsonb_typeof(requested_color_names) = 'object' then requested_color_names
          else '{}'::jsonb
        end
      ) as color_entry(color_hex, color_name)
      where color_hex !~ '^#[0-9A-Fa-f]{6}$'
         or length(trim(color_name)) = 0
         or length(trim(color_name)) > 64
    )
    or exists (
      select 1
      from unnest(string_to_array(coalesce(requested_colors, ''), ',')) as selected_color(color_hex)
      where trim(selected_color.color_hex) ~ '^#[0-9A-Fa-f]{6}$'
        and not exists (
          select 1
          from jsonb_each_text(
            case
              when jsonb_typeof(requested_color_names) = 'object' then requested_color_names
              else '{}'::jsonb
            end
          ) as named_color(color_hex, color_name)
          where upper(named_color.color_hex) = upper(trim(selected_color.color_hex))
        )
    )
    or requested_priority is null
    or requested_priority not in ('عادي', 'مرتفع', 'عاجل')
    or requested_status is null
    or requested_status not in (
      'قيد الانتظار', 'قيد الفرش', 'تم الفرش', 'جاهز للقص',
      'تم القص', 'في انتظار الخياطة', 'جاري الخياطة', 'تمت الخياطة', 'جاري التشطيب', 'تم التشطيب',
      'جاري المكواة', 'تم الكي', 'جاري الطباعة', 'تمت الطباعة',
      'جاري التكييس', 'تم التكييس', 'جاري الفرز', 'تم الفرز', 'مكتمل', 'جاهز للتسليم', 'تم التسليم'
    ) then
    raise exception 'Invalid factory order data.';
  end if;

  select coalesce(jsonb_object_agg(upper(color_hex), trim(color_name)), '{}'::jsonb)
    into normalized_color_names
  from jsonb_each_text(requested_color_names) as color_entry(color_hex, color_name);

  select customer.id, customer.user_id
    into matched_customer_id, matched_client_id
  from public.factory_clients as customer
  where customer.id = requested_customer_id
  for update;

  if matched_customer_id is null then
    raise exception 'The selected factory customer does not exist.';
  end if;

  resolved_model_name := coalesce(
    nullif(trim(coalesce(requested_model_name, '')), ''),
    nullif(trim(coalesce(requested_model_number, '')), '')
  );

  if requested_order_id is null
     and requested_status in (
       'في انتظار الخياطة', 'جاري الخياطة', 'تمت الخياطة', 'جاري التشطيب', 'تم التشطيب',
       'جاري المكواة', 'تم الكي', 'جاري الطباعة', 'تمت الطباعة',
       'جاري التكييس', 'تم التكييس', 'جاري الفرز', 'تم الفرز', 'مكتمل', 'جاهز للتسليم'
     ) then
    raise exception 'New orders cannot skip the cutting and sewing handoff workflow.';
  end if;

  if requested_order_id is null then
    insert into public.orders (
      client_id, customer_id, model_name, model_number, colors, color_names, sizes,
      original_total_pieces, total_pieces, delivered_pieces, price_per_piece, paid_amount, expected_delivery_date, model_image_url, model_image_url_2, priority,
      production_type, work_stages, pricing_mode, stage_prices, color_size_distribution, operational_expenses, client_model_code, status
    )
    values (
      matched_client_id, matched_customer_id, resolved_model_name,
      coalesce(trim(requested_model_number), ''),
      coalesce(trim(requested_colors), ''), normalized_color_names, coalesce(trim(requested_sizes), ''),
      requested_original_quantity, requested_quantity, requested_delivered_pieces,
      requested_price_per_piece, requested_paid_amount, requested_expected_delivery_date, requested_model_image_url, requested_model_image_url_2,
      trim(requested_priority), requested_production_type, requested_work_stages, requested_pricing_mode,
      requested_stage_prices, requested_color_size_distribution, requested_operational_expenses,
      trim(coalesce(requested_client_model_code, '')), trim(requested_status)
    )
    returning id into saved_order_id;
    if requested_operational_expenses > 0 then
      insert into public.factory_order_expenses (
        order_id, description, amount, created_by
      )
      values (
        saved_order_id, 'مصاريف تشغيل عند إنشاء الموديل',
        requested_operational_expenses, auth.uid()
      );
    end if;
    if requested_delivered_pieces > 0 then
      insert into public.factory_deliveries (
        order_id, customer_id, quantity, price_per_piece,
        expected_delivery_date, delivered_at, legacy_import
      )
      values (
        saved_order_id, matched_customer_id, requested_delivered_pieces,
        requested_price_per_piece, requested_expected_delivery_date, now(), true
      );
      update public.production_stages
      set target_quantity = greatest(target_quantity, requested_delivered_pieces),
          completed_quantity = requested_delivered_pieces
      where order_id = saved_order_id
        and stage_name = 'delivery';
    end if;
    update public.production_stages
    set fabric = nullif(trim(requested_fabric), ''),
        line_name = nullif(trim(requested_line_name), '')
    where order_id = saved_order_id;
  else
    select customer_id, price_per_piece, status, total_pieces
      into current_customer_id, current_price_per_piece, current_status, current_total_pieces
    from public.orders
    where id = requested_order_id
    for update;
    if not found then
      raise exception 'Factory order not found.';
    end if;
    if current_customer_id is not null and current_customer_id is distinct from matched_customer_id then
      raise exception 'An existing factory order cannot be reassigned to another customer.';
    end if;
    -- Accept only canonical units plus legacy values that are normalized below.
    if exists (
      select 1 from public.orders
      where id = requested_order_id
        and archived_at is not null
    ) then
      raise exception 'Archived factory orders cannot be edited.';
    end if;
    if current_status in ('تم التسليم', 'تم التسليم بالكامل', 'تم التسليم والإغلاق')
       and requested_status is distinct from current_status then
      raise exception 'A delivered factory order must remain closed.';
    end if;
    if current_status is distinct from requested_status
       and requested_status in (
         'في انتظار الخياطة', 'جاري الخياطة', 'تمت الخياطة', 'جاري التشطيب', 'تم التشطيب',
         'جاري المكواة', 'تم الكي', 'جاري الطباعة', 'تمت الطباعة',
         'جاري التكييس', 'تم التكييس', 'جاري الفرز', 'تم الفرز', 'مكتمل', 'جاهز للتسليم'
       ) then
      raise exception 'Use the production workflow controls to move an order into sewing or finishing.';
    end if;
    if current_status in (
      'في انتظار الخياطة', 'جاري الخياطة', 'تمت الخياطة', 'جاري التشطيب', 'تم التشطيب',
      'جاري المكواة', 'تم الكي', 'جاري الطباعة', 'تمت الطباعة',
      'جاري التكييس', 'تم التكييس', 'جاري الفرز', 'تم الفرز', 'مكتمل', 'جاهز للتسليم'
    )
       and requested_status is distinct from current_status then
      raise exception 'Production workflow statuses can only be changed through their stage controls.';
    end if;
    if exists (
      select 1 from public.orders
      where id = requested_order_id
        and delivered_pieces <> requested_delivered_pieces
    ) then
      raise exception 'Record deliveries through the delivery workflow; delivered totals cannot be edited.';
    end if;
    if exists (
      select 1
      from public.production_stages as stage
      where stage.order_id = requested_order_id
        and stage.stage_name in ('cutting', 'sewing', 'finishing', 'ironing', 'printing', 'packaging', 'sorting')
        and not (stage.stage_name = any(requested_work_stages))
        and (
          stage.completed_quantity > 0
          or stage.status not in ('معلق', 'قيد الانتظار')
          or stage.worker_id is not null
          or nullif(trim(coalesce(stage.fabric, '')), '') is not null
          or stage.fabric_id is not null
          or stage.layer_count > 0
          or stage.bolt_count > 0
          or stage.fabric_quantity > 0
          or stage.technical_notes <> ''
        )
    ) then
      raise exception 'A work section with recorded production activity cannot be removed from the order.';
    end if;
    update public.production_stages
    set target_quantity = case
      when stage_name = 'delivery' then greatest(requested_quantity, requested_delivered_pieces)
      else requested_quantity
    end,
        completed_quantity = case
      when stage_name = 'delivery' then requested_delivered_pieces
          else least(completed_quantity, requested_quantity)
        end,
        line_name = nullif(trim(requested_line_name), '')
    where order_id = requested_order_id;
    update public.orders
    set client_id = matched_client_id,
        customer_id = matched_customer_id,
        model_name = resolved_model_name,
        model_number = coalesce(trim(requested_model_number), ''),
        colors = coalesce(trim(requested_colors), ''),
        color_names = normalized_color_names,
        sizes = coalesce(trim(requested_sizes), ''),
        original_total_pieces = requested_original_quantity,
        total_pieces = requested_quantity,
        delivered_pieces = requested_delivered_pieces,
        price_per_piece = requested_price_per_piece,
        paid_amount = requested_paid_amount,
        expected_delivery_date = requested_expected_delivery_date,
        model_image_url = requested_model_image_url,
        model_image_url_2 = requested_model_image_url_2,
        priority = trim(requested_priority),
        production_type = requested_production_type,
        work_stages = requested_work_stages,
        pricing_mode = requested_pricing_mode,
        stage_prices = requested_stage_prices,
        color_size_distribution = requested_color_size_distribution,
        operational_expenses = requested_operational_expenses,
        client_model_code = trim(coalesce(requested_client_model_code, '')),
        status = trim(requested_status)
    where id = requested_order_id;
    insert into public.production_stages (order_id, stage_name, target_quantity)
    select distinct requested_order_id, selected_stage.stage_name, requested_quantity
    from unnest(requested_work_stages || array['delivery']::text[]) as selected_stage(stage_name)
    where not exists (
      select 1
      from public.production_stages as existing_stage
      where existing_stage.order_id = requested_order_id
        and existing_stage.stage_name = selected_stage.stage_name
    );
    delete from public.production_stages as stage
    where stage.order_id = requested_order_id
      and stage.stage_name in ('cutting', 'sewing', 'finishing', 'ironing', 'printing', 'packaging', 'sorting')
      and not (stage.stage_name = any(requested_work_stages));
    if current_price_per_piece is distinct from requested_price_per_piece then
      update public.factory_deliveries
      set price_per_piece = requested_price_per_piece
      where order_id = requested_order_id;
    end if;
    saved_order_id := requested_order_id;
  end if;

  if requested_operational_expenses > 0 then
    update public.factory_cash_transactions
    set description = concat_ws(' · ', resolved_model_name, nullif(trim(coalesce(requested_model_number, '')), '')),
        amount = requested_operational_expenses
    where order_id = saved_order_id
      and order_expense_id is null;
    if not found then
      insert into public.factory_cash_transactions (
        order_id, direction, category, description, amount, payment_method, occurred_at, created_by
      )
      values (
        saved_order_id,
        'expense',
        'مصاريف تشغيل الموديل',
        concat_ws(' · ', resolved_model_name, nullif(trim(coalesce(requested_model_number, '')), '')),
        requested_operational_expenses,
        'نقدي',
        now(),
        auth.uid()
      );
    end if;
  else
    delete from public.factory_cash_transactions
    where order_id = saved_order_id
      and order_expense_id is null;
  end if;

  return saved_order_id;
end;
$$;

create or replace function public.admin_update_factory_order_stage_status(
  requested_order_id uuid,
  requested_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  target_stage_name text;
  earlier_stage record;
  extra_stage_names text[] := array['finishing', 'ironing', 'printing', 'packaging', 'sorting']::text[];
  next_stage_name text;
  target_stage_position bigint;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can update additional production stages.';
  end if;
  if requested_order_id is null or requested_status is null then
    raise exception 'Choose an order and a valid production status.';
  end if;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found
     or current_order.archived_at is not null
     or current_order.status = 'تم التسليم' then
    raise exception 'This order is closed or unavailable for production updates.';
  end if;

  target_stage_name := case requested_status
    when 'جاري التشطيب' then 'finishing'
    when 'تم التشطيب' then 'finishing'
    when 'جاري المكواة' then 'ironing'
    when 'تم الكي' then 'ironing'
    when 'جاري الطباعة' then 'printing'
    when 'تمت الطباعة' then 'printing'
    when 'جاري التكييس' then 'packaging'
    when 'تم التكييس' then 'packaging'
    when 'جاري الفرز' then 'sorting'
    when 'تم الفرز' then 'sorting'
    else null
  end;

  if target_stage_name is not null then
    if not (target_stage_name = any(current_order.work_stages)) then
      raise exception 'This order does not include the selected additional production stage.';
    end if;
    if current_order.status not in (
      'تمت الخياطة', 'مكتمل', 'جاري التشطيب', 'تم التشطيب',
      'جاري المكواة', 'تم الكي', 'جاري الطباعة', 'تمت الطباعة',
      'جاري التكييس', 'تم التكييس', 'جاري الفرز', 'تم الفرز'
    ) then
      raise exception 'Complete sewing before updating an additional production stage.';
    end if;

    for earlier_stage in
      select selected_stage.stage_name
      from unnest(current_order.work_stages) with ordinality as selected_stage(stage_name, position)
      where selected_stage.stage_name = any(extra_stage_names)
        and selected_stage.position < (
          select selected_stage_target.position
          from unnest(current_order.work_stages) with ordinality as selected_stage_target(stage_name, position)
          where selected_stage_target.stage_name = target_stage_name
        )
    loop
      if not exists (
        select 1
        from public.production_stages
        where order_id = requested_order_id
          and stage_name = earlier_stage.stage_name
          and status = 'مكتمل'
      ) then
        raise exception 'Complete the earlier additional production stages first.';
      end if;
    end loop;

    update public.production_stages
    set status = case
          when requested_status in ('تم التشطيب', 'تم الكي', 'تمت الطباعة', 'تم التكييس', 'تم الفرز') then 'مكتمل'
          else 'قيد التنفيذ'
        end,
        completed_quantity = case
          when requested_status in ('تم التشطيب', 'تم الكي', 'تمت الطباعة', 'تم التكييس', 'تم الفرز') then target_quantity
          else least(completed_quantity, target_quantity)
        end,
        updated_at = now()
    where order_id = requested_order_id
      and stage_name = target_stage_name;
    if not found then
      raise exception 'The selected additional production stage was not initialized.';
    end if;

    if requested_status in ('تم التشطيب', 'تم الكي', 'تمت الطباعة', 'تم التكييس', 'تم الفرز') then
      select selected_stage.position
        into target_stage_position
      from unnest(current_order.work_stages) with ordinality as selected_stage(stage_name, position)
      where selected_stage.stage_name = target_stage_name;

      select selected_stage.stage_name
        into next_stage_name
      from unnest(current_order.work_stages) with ordinality as selected_stage(stage_name, position)
      where selected_stage.stage_name = any(extra_stage_names)
        and selected_stage.position > target_stage_position
        and exists (
          select 1
          from public.production_stages as next_stage
          where next_stage.order_id = requested_order_id
            and next_stage.stage_name = selected_stage.stage_name
            and next_stage.status <> 'مكتمل'
        )
      order by selected_stage.position
      limit 1;

      if next_stage_name is null then
        update public.orders
        set status = 'جاهز للتسليم'
        where id = requested_order_id;
        update public.production_stages
        set status = 'جاهز للتسليم',
            updated_at = now()
        where order_id = requested_order_id
          and stage_name = 'delivery';
      else
        update public.production_stages
        set status = 'قيد التنفيذ',
            updated_at = now()
        where order_id = requested_order_id
          and stage_name = next_stage_name;
        update public.orders
        set status = case next_stage_name
          when 'finishing' then 'جاري التشطيب'
          when 'ironing' then 'جاري المكواة'
          when 'printing' then 'جاري الطباعة'
          when 'packaging' then 'جاري التكييس'
          when 'sorting' then 'جاري الفرز'
        end
        where id = requested_order_id;
      end if;
    else
      update public.orders
      set status = requested_status
      where id = requested_order_id;
    end if;
    return;
  end if;

  if requested_status = 'جاهز للتسليم' then
    if current_order.status not in (
      'تمت الخياطة', 'مكتمل', 'جاري التشطيب', 'تم التشطيب',
      'جاري المكواة', 'تم الكي', 'جاري الطباعة', 'تمت الطباعة',
      'جاري التكييس', 'تم التكييس', 'جاري الفرز', 'تم الفرز'
    ) then
      raise exception 'Finish sewing before marking the order ready for delivery.';
    end if;
    if exists (
      select 1
      from unnest(current_order.work_stages) as selected_stage(stage_name)
      where selected_stage.stage_name = any(extra_stage_names)
        and not exists (
          select 1
          from public.production_stages
          where order_id = requested_order_id
            and stage_name = selected_stage.stage_name
            and status = 'مكتمل'
        )
    ) then
      raise exception 'Complete all selected additional production stages before delivery.';
    end if;
    update public.orders
    set status = 'جاهز للتسليم'
    where id = requested_order_id;
    update public.production_stages
    set status = 'جاهز للتسليم',
        updated_at = now()
    where order_id = requested_order_id
      and stage_name = 'delivery';
    return;
  end if;

  raise exception 'The requested status is not an admin-manageable additional stage.';
end;
$$;



do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('users', 'orders', 'production_stages')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      existing_policy.policyname,
      existing_policy.tablename
    );
  end loop;
end;
$$;

create or replace function public.has_active_factory_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and status = 'active'
      and role = any(allowed_roles)
  );
$$;

create or replace function public.owns_factory_client_profile(requested_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.factory_clients
    where id = requested_customer_id
      and user_id = auth.uid()
  );
$$;

-- Flexible application records keep evolving optional fields in JSONB so
-- ordinary UI field additions do not require new SQL columns.
create table if not exists public.factory_records (
  id uuid primary key default gen_random_uuid(),
  collection text not null check (length(trim(collection)) > 0),
  owner_id uuid references auth.users (id) on delete set null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.factory_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.factory_clients (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  order_expense_id uuid,
  direction text not null check (direction in ('income', 'expense')),
  category text not null check (length(trim(category)) between 1 and 120),
  description text not null default '',
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null default 'غير محدد',
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.factory_cash_transactions
  add column if not exists customer_id uuid references public.factory_clients (id) on delete set null,
  add column if not exists order_id uuid references public.orders (id) on delete set null,
  add column if not exists order_expense_id uuid;

create index if not exists factory_cash_transactions_date_idx
  on public.factory_cash_transactions (occurred_at desc);
create index if not exists factory_cash_transactions_customer_date_idx
  on public.factory_cash_transactions (customer_id, occurred_at desc)
  where customer_id is not null;
create table if not exists public.factory_order_expenses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 240),
  amount numeric(14, 2) not null check (amount > 0),
  expense_type text not null default 'customer_cash',
  is_legacy boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.factory_order_expenses
  add column if not exists expense_type text not null default 'customer_cash';
alter table public.factory_order_expenses
  drop constraint if exists factory_order_expenses_expense_type_check,
  add constraint factory_order_expenses_expense_type_check
    check (expense_type in ('customer_cash', 'treasury_only', 'included_in_price'));
alter table public.factory_cash_transactions
  drop constraint if exists factory_cash_transactions_order_expense_id_fkey,
  add constraint factory_cash_transactions_order_expense_id_fkey
    foreign key (order_expense_id) references public.factory_order_expenses (id) on delete cascade;
drop index if exists public.factory_cash_transactions_order_idx;
create unique index if not exists factory_cash_transactions_order_idx
  on public.factory_cash_transactions (order_id)
  where order_id is not null and order_expense_id is null;
create unique index if not exists factory_cash_transactions_order_expense_idx
  on public.factory_cash_transactions (order_expense_id)
  where order_expense_id is not null;

update public.factory_cash_transactions
set customer_id = null
where order_id is not null and order_expense_id is null;

create index if not exists factory_order_expenses_order_date_idx
  on public.factory_order_expenses (order_id, created_at desc);
create unique index if not exists factory_order_expenses_legacy_order_idx
  on public.factory_order_expenses (order_id) where is_legacy;

insert into public.factory_order_expenses (order_id, description, amount, is_legacy, created_at)
select factory_order.id,
       'مصاريف تشغيل سابقة (رصيد مجمع)',
       factory_order.operational_expenses,
       true,
       factory_order.created_at
from public.orders as factory_order
where factory_order.operational_expenses > 0
  and not exists (
    select 1
    from public.factory_order_expenses as existing_expense
    where existing_expense.order_id = factory_order.id
  )
on conflict (order_id) where is_legacy do nothing;

create or replace function public.read_factory_order_expenses_admin()
returns setof public.factory_order_expenses
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can read model expense entries.';
  end if;
  return query
    select expense.*
    from public.factory_order_expenses as expense
    order by expense.created_at desc;
end;
$$;

drop function if exists public.admin_add_factory_order_expense(uuid, text, numeric);
create or replace function public.admin_add_factory_order_expense(
  requested_order_id uuid,
  requested_description text,
  requested_amount numeric,
  requested_expense_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  expense_id uuid;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can add model expenses.';
  end if;
  if requested_order_id is null
     or length(trim(coalesce(requested_description, ''))) not between 1 and 240
     or requested_amount is null
     or requested_amount <= 0
     or requested_amount > 999999999999.99
     or requested_expense_type is null
     or requested_expense_type not in ('customer_cash', 'treasury_only', 'included_in_price') then
    raise exception 'Enter a valid model, expense type, description, and positive amount.';
  end if;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
    and archived_at is null
  for update;
  if not found then
    raise exception 'The active factory order was not found.';
  end if;

  insert into public.factory_order_expenses (
    order_id, description, amount, expense_type, created_by
  )
  values (
    requested_order_id, trim(requested_description), requested_amount,
    requested_expense_type, auth.uid()
  )
  returning id into expense_id;

  insert into public.factory_cash_transactions (
    customer_id, order_id, order_expense_id, direction, category, description, amount,
    payment_method, occurred_at, created_by
  )
  values (
    case when requested_expense_type = 'customer_cash' then current_order.customer_id else null end,
    requested_order_id, expense_id, 'expense',
    case requested_expense_type
      when 'customer_cash' then 'مصروف خارجي على العميل'
      when 'treasury_only' then 'مصروف تشغيلي من الخزنة'
      else 'مصروف مدمج ضمن سعر القطعة'
    end,
    concat_ws(' · ', current_order.model_name, nullif(trim(current_order.model_number), ''), trim(requested_description)),
    requested_amount, 'نقدي', now(), auth.uid()
  );

  return expense_id;
end;
$$;

drop function if exists public.save_factory_cash_transaction(text, text, text, numeric, text, timestamptz);
drop function if exists public.save_factory_cash_transaction(text, text, text, numeric, text, timestamptz, uuid);
create or replace function public.save_factory_cash_transaction(
  requested_direction text,
  requested_category text,
  requested_description text,
  requested_amount numeric,
  requested_payment_method text,
  requested_occurred_at timestamptz,
  requested_customer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_transaction_id uuid;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can record cash transactions.';
  end if;
  if requested_direction not in ('income', 'expense')
     or length(trim(coalesce(requested_category, ''))) not between 1 and 120
     or requested_amount is null
     or requested_amount <= 0
     or requested_amount > 999999999999.99
     or requested_occurred_at is null
     or (requested_customer_id is not null and requested_direction <> 'expense')
     or (requested_customer_id is not null and not exists (
       select 1 from public.factory_clients where id = requested_customer_id
     ))
     or (requested_customer_id is not null and exists (
       select 1 from public.factory_clients
       where id = requested_customer_id
         and account_period_started_at is not null
         and requested_occurred_at < account_period_started_at
     )) then
    raise exception 'Enter a valid cash direction, category, positive amount, and date.';
  end if;

  insert into public.factory_cash_transactions (
    customer_id, direction, category, description, amount, payment_method, occurred_at, created_by
  )
  values (
    requested_customer_id,
    requested_direction,
    trim(requested_category),
    coalesce(trim(requested_description), ''),
    round(requested_amount, 2),
    coalesce(nullif(trim(requested_payment_method), ''), 'غير محدد'),
    requested_occurred_at,
    auth.uid()
  )
  returning id into saved_transaction_id;

  return saved_transaction_id;
end;
$$;

create or replace function public.update_factory_cash_transaction(
  requested_transaction_id uuid,
  requested_direction text,
  requested_category text,
  requested_description text,
  requested_amount numeric,
  requested_payment_method text,
  requested_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_customer_id uuid;
  current_order_id uuid;
  account_period_start timestamptz;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can edit cash transactions.';
  end if;
  if requested_transaction_id is null
     or requested_direction not in ('income', 'expense')
     or length(trim(coalesce(requested_category, ''))) not between 1 and 120
     or requested_amount is null
     or requested_amount <= 0
     or requested_amount > 999999999999.99
     or requested_occurred_at is null then
    raise exception 'Enter a valid cash direction, category, positive amount, and date.';
  end if;

  select customer_id, order_id
    into current_customer_id, current_order_id
  from public.factory_cash_transactions
  where id = requested_transaction_id
  for update;
  if not found then
    raise exception 'Cash transaction not found.';
  end if;
  if current_order_id is not null then
    raise exception 'Order operating expenses must be changed from the order editor.';
  end if;
  if current_customer_id is not null and requested_direction <> 'expense' then
    raise exception 'A client-account expense cannot be changed to income.';
  end if;
  if current_customer_id is not null then
    select account_period_started_at
      into account_period_start
    from public.factory_clients
    where id = current_customer_id;
    if account_period_start is not null
       and (requested_occurred_at < account_period_start
         or exists (
           select 1
           from public.factory_cash_transactions
           where id = requested_transaction_id
             and occurred_at < account_period_start
         )) then
      raise exception 'Cash transactions in a settled client period are immutable.';
    end if;
  end if;

  update public.factory_cash_transactions
  set direction = requested_direction,
      category = trim(requested_category),
      description = coalesce(trim(requested_description), ''),
      amount = round(requested_amount, 2),
      payment_method = coalesce(nullif(trim(requested_payment_method), ''), 'غير محدد'),
      occurred_at = requested_occurred_at
  where id = requested_transaction_id;
end;
$$;

create or replace function public.read_factory_client_cash_transactions()
returns table (
  id uuid,
  customer_id uuid,
  direction text,
  category text,
  description text,
  amount numeric,
  payment_method text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_active_factory_role(array['client']) then
    raise exception 'Only active clients can read their account cash entries.';
  end if;

  return query
    select transaction.id,
           transaction.customer_id,
           transaction.direction,
           transaction.category,
           transaction.description,
           transaction.amount,
           transaction.payment_method,
           transaction.occurred_at
    from public.factory_cash_transactions as transaction
    where transaction.customer_id in (
      select customer.id
      from public.factory_clients as customer
      where customer.user_id = auth.uid()
    )
    order by transaction.occurred_at desc;
end;
$$;

create or replace function public.read_factory_client_fabric_stock()
returns table (
  fabric_id uuid,
  fabric_name text,
  color_name text,
  unit text,
  quantity_available numeric,
  received_at timestamptz,
  updated_at timestamptz,
  movement_id uuid,
  transaction_type text,
  movement_quantity numeric,
  movement_notes text,
  movement_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_active_factory_role(array['client']) then
    raise exception 'Only active clients can read their assigned fabric stock.';
  end if;

  return query
    select fabric.id,
           fabric.name,
           fabric.color_name,
           fabric.unit,
           fabric.quantity_available,
           fabric.received_at,
           fabric.updated_at,
           movement.id,
           movement.transaction_type,
           movement.quantity,
           movement.notes,
           movement.created_at
    from public.factory_clients as customer
    join public.factory_fabrics as fabric on fabric.customer_id = customer.id
    left join public.factory_fabric_transactions as movement on movement.fabric_id = fabric.id
    where customer.user_id = auth.uid()
    order by fabric.name, movement.created_at desc nulls last;
end;
$$;

create or replace function public.submit_factory_client_model_request(
  requested_model_name text,
  requested_model_number text,
  requested_quantity integer,
  requested_notes text,
  requested_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_client_id uuid;
  request_id uuid := gen_random_uuid();
begin
  if not public.has_active_factory_role(array['client']) then
    raise exception 'Only active clients can submit model requests.';
  end if;

  select customer.id
    into matched_client_id
  from public.factory_clients as customer
  where customer.user_id = auth.uid();

  if matched_client_id is null then
    raise exception 'The active client account is not linked to a client profile.';
  end if;
  if requested_quantity is not null and requested_quantity < 0 then
    raise exception 'The requested quantity cannot be negative.';
  end if;
  if length(coalesce(requested_model_name, '')) > 160
     or length(coalesce(requested_model_number, '')) > 100
     or length(coalesce(requested_notes, '')) > 2000 then
    raise exception 'The client model request fields exceed their allowed lengths.';
  end if;
  if requested_image_path is not null
     and requested_image_path not like ('client-submissions/' || auth.uid()::text || '/%') then
    raise exception 'The requested image must be uploaded to the authenticated client folder.';
  end if;

  insert into public.factory_client_model_requests (
    id, client_id, user_id, model_name, model_number, quantity, notes, image_path
  )
  values (
    request_id,
    matched_client_id,
    auth.uid(),
    nullif(trim(requested_model_name), ''),
    nullif(trim(requested_model_number), ''),
    requested_quantity,
    coalesce(trim(requested_notes), ''),
    requested_image_path
  );

  return request_id;
end;
$$;

create or replace function public.guard_factory_financial_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_customer_id uuid;
  payment_period_started_at timestamptz;
begin
  if tg_op = 'DELETE'
     and current_setting('factory.reset_in_progress', true) = 'on'
     and public.is_active_factory_admin() then
    return old;
  end if;

  if old.collection = 'settlements' then
    if tg_op = 'UPDATE'
       and (
         public.is_active_factory_admin()
         or current_setting('factory.client_link_sync', true) = 'on'
       )
       and new.id = old.id
       and new.collection = old.collection
       and new.payload = old.payload
       and new.created_at = old.created_at
       and new.updated_at = old.updated_at
       and new.owner_id is distinct from old.owner_id then
      return new;
    end if;
    raise exception 'Settled account history is immutable.';
  end if;

  if old.collection = 'payments'
     and old.payload ->> 'customerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    payment_customer_id := (old.payload ->> 'customerId')::uuid;
    select account_period_started_at
      into payment_period_started_at
    from public.factory_clients
    where id = payment_customer_id;
    if payment_period_started_at is not null and old.created_at < payment_period_started_at then
      if tg_op = 'UPDATE'
         and (
           public.is_active_factory_admin()
           or current_setting('factory.client_link_sync', true) = 'on'
         )
         and new.id = old.id
         and new.collection = old.collection
         and new.payload = old.payload
         and new.created_at = old.created_at
         and new.updated_at = old.updated_at
         and new.owner_id is distinct from old.owner_id then
        return new;
      end if;
      raise exception 'Payments in a settled period are immutable.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_factory_financial_history on public.factory_records;
create trigger guard_factory_financial_history
  before update or delete on public.factory_records
  for each row execute procedure public.guard_factory_financial_history();

-- Backfill records for client profiles linked before account synchronization.
do $$
begin
  perform set_config('factory.client_link_sync', 'on', true);

  update public.orders as factory_order
  set client_id = customer.user_id
  from public.factory_clients as customer
  where customer.id = factory_order.customer_id
    and customer.user_id is not null
    and factory_order.client_id is distinct from customer.user_id;

  update public.factory_records as account_record
  set owner_id = customer.user_id
  from public.factory_clients as customer
  where customer.user_id is not null
    and account_record.collection in ('payments', 'settlements')
    and account_record.owner_id is distinct from customer.user_id
    and (
      account_record.payload ->> 'customerId' = customer.id::text
      or account_record.payload ->> 'customer_id' = customer.id::text
      or account_record.payload ->> 'clientId' = customer.id::text
      or account_record.payload ->> 'client_id' = customer.id::text
    );

  update public.factory_client_model_requests as model_request
  set user_id = customer.user_id
  from public.factory_clients as customer
  where customer.id = model_request.client_id
    and customer.user_id is not null
    and model_request.user_id is distinct from customer.user_id;
end;
$$;

create index if not exists factory_records_collection_created_idx
  on public.factory_records (collection, created_at desc);
create index if not exists factory_records_owner_collection_idx
  on public.factory_records (owner_id, collection);

create table if not exists public.factory_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  customer_id uuid not null references public.factory_clients (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  price_per_piece numeric(12, 2) not null check (price_per_piece >= 0),
  amount numeric(14, 2) generated always as (quantity * price_per_piece) stored,
  recipient_name text not null default '',
  expected_delivery_date date,
  delivered_at timestamptz not null default now(),
  legacy_import boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.factory_deliveries
  add column if not exists recipient_name text not null default '',
  add column if not exists expected_delivery_date date;

alter table public.users
  add column if not exists job_title text not null default 'عامل إنتاج',
  add column if not exists can_submit_production boolean not null default false;

create or replace function public.is_valid_factory_production_colors(color_list jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when color_list is null or jsonb_typeof(color_list) <> 'array' then false
    else jsonb_array_length(color_list) > 0
      and not exists (
        select 1
        from jsonb_array_elements(color_list) as color_entry(value)
        where jsonb_typeof(color_entry.value) <> 'object'
          or jsonb_typeof(color_entry.value -> 'hex') <> 'string'
          or coalesce(color_entry.value ->> 'hex', '') !~ '^#[0-9A-Fa-f]{6}$'
          or (color_entry.value ? 'name' and jsonb_typeof(color_entry.value -> 'name') <> 'string')
          or length(coalesce(color_entry.value ->> 'name', '')) > 64
          or (
            color_entry.value ? 'sizes'
            and (
              jsonb_typeof(color_entry.value -> 'sizes') <> 'object'
              or case
                when jsonb_typeof(color_entry.value -> 'sizes') = 'object'
                  then not exists (
                    select 1
                    from jsonb_object_keys(color_entry.value -> 'sizes') as size_key(key)
                  )
                else false
              end
              or exists (
                select 1
                from jsonb_each(
                  case
                    when jsonb_typeof(color_entry.value -> 'sizes') = 'object'
                      then color_entry.value -> 'sizes'
                    else '{}'::jsonb
                  end
                ) as size_entry(key, value)
                where size_entry.key = ''
                  or jsonb_typeof(size_entry.value) <> 'number'
                  or size_entry.value::text !~ '^[1-9][0-9]*$'
                  or (size_entry.value #>> '{}')::numeric > 2147483647
              )
            )
          )
      )
  end;
$$;

create or replace function public.factory_production_colors_match_quantity(color_list jsonb, expected_quantity integer)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when expected_quantity is null or expected_quantity < 1
      or not public.is_valid_factory_production_colors(color_list) then false
    when exists (
      select 1
      from jsonb_array_elements(color_list) as color_entry(value)
      where not (color_entry.value ? 'sizes')
    ) then false
    else coalesce((
      select sum((size_entry.value #>> '{}')::numeric)
      from jsonb_array_elements(color_list) as color_entry(value)
      cross join lateral jsonb_each(color_entry.value -> 'sizes') as size_entry(key, value)
    ), 0) = expected_quantity
  end;
$$;

create table if not exists public.factory_worker_production_submissions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references auth.users (id) on delete set null,
  parent_submission_id uuid references public.factory_worker_production_submissions (id) on delete restrict,
  worker_name text not null,
  job_title text not null default 'عامل إنتاج',
  model_name text not null check (length(trim(model_name)) between 1 and 160),
  model_number text not null default '' check (length(model_number) <= 120),
  quantity integer not null check (quantity > 0),
  colors jsonb not null default '[]'::jsonb,
  image_path text,
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.factory_worker_production_submissions
  add column if not exists model_number text not null default '',
  add column if not exists parent_submission_id uuid references public.factory_worker_production_submissions (id) on delete restrict,
  drop constraint if exists factory_worker_production_submissions_model_number_check,
  add constraint factory_worker_production_submissions_model_number_check
    check (length(model_number) <= 120),
  drop constraint if exists factory_worker_production_submissions_parent_not_self_check,
  add constraint factory_worker_production_submissions_parent_not_self_check
    check (parent_submission_id is null or parent_submission_id <> id);
alter table public.factory_worker_production_submissions
  drop constraint if exists factory_worker_production_submissions_colors_check,
  add constraint factory_worker_production_submissions_colors_check
    check (public.is_valid_factory_production_colors(colors));

create table if not exists public.factory_finished_goods (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.factory_worker_production_submissions (id) on delete restrict,
  order_id uuid references public.orders (id) on delete set null,
  customer_id uuid not null references public.factory_clients (id) on delete restrict,
  model_name text not null check (length(trim(model_name)) between 1 and 160),
  model_number text not null default '' check (length(model_number) <= 120),
  quantity integer not null check (quantity > 0),
  colors jsonb not null default '[]'::jsonb,
  image_path text,
  worker_name text not null,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz not null default now()
);
alter table public.factory_finished_goods
  add column if not exists model_number text not null default '',
  drop constraint if exists factory_finished_goods_model_number_check,
  add constraint factory_finished_goods_model_number_check
    check (length(model_number) <= 120);
alter table public.factory_finished_goods
  drop constraint if exists factory_finished_goods_colors_check,
  add constraint factory_finished_goods_colors_check
    check (public.is_valid_factory_production_colors(colors));
create index if not exists factory_worker_production_submissions_worker_created_idx
  on public.factory_worker_production_submissions (worker_id, created_at desc);
create index if not exists factory_worker_production_submissions_parent_idx
  on public.factory_worker_production_submissions (parent_submission_id);
create index if not exists factory_worker_production_submissions_status_created_idx
  on public.factory_worker_production_submissions (status, created_at desc);
create index if not exists factory_finished_goods_customer_confirmed_idx
  on public.factory_finished_goods (customer_id, confirmed_at desc);

create table if not exists public.factory_fabrics (
  id uuid primary key default gen_random_uuid(),
  stock_scope text not null default 'owner' check (stock_scope in ('owner', 'incoming')),
  customer_id uuid references public.factory_clients (id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  fabric_type text not null default '',
  color_name text not null default '',
  color_hex text not null default '#FFFFFF' check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  unit text not null check (unit in ('متر', 'توب')),
  quantity_available numeric(14, 3) not null default 0 check (quantity_available >= 0),
  received_at timestamptz,
  received_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.factory_fabrics
  add column if not exists stock_scope text not null default 'owner',
  add column if not exists customer_id uuid references public.factory_clients (id) on delete set null,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users (id) on delete set null;

alter table public.factory_fabrics
  drop constraint if exists factory_fabrics_unit_check;

do $$
begin
  if exists (
    select 1
    from public.factory_fabrics
    where unit not in ('متر', 'توب', 'طوب', 'ثوب')
  ) then
    raise exception 'Fabric inventory contains unsupported units. Reconcile those stock records manually before rerunning the schema; quantities were not converted.';
  end if;
end;
$$;

-- Normalize values saved by earlier UI/schema versions.
update public.factory_fabrics
set unit = 'توب'
where unit in ('طوب', 'ثوب');

alter table public.factory_fabrics drop column if exists color_number;

alter table public.factory_fabrics
  add constraint factory_fabrics_unit_check
    check (unit in ('متر', 'توب'));

create table if not exists public.factory_cutting_stories (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.factory_clients (id) on delete set null,
  customer_name text not null,
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_by_name text not null,
  model_name text not null,
  model_number text not null default '',
  source_order_id uuid references public.orders (id) on delete set null,
  factory_model_code text not null default '',
  size_data jsonb not null check (jsonb_typeof(size_data) = 'object'),
  color_ply_data jsonb not null check (jsonb_typeof(color_ply_data) = 'object'),
  total_pieces integer not null check (total_pieces > 0),
  ply_count integer not null check (ply_count > 0),
  fabric text not null,
  fabric_details text not null default '',
  fabric_id uuid references public.factory_fabrics (id) on delete restrict,
  fabric_quantity numeric(14, 3) not null check (fabric_quantity > 0),
  bolt_count integer not null default 0 check (bolt_count >= 0),
  fabric_unit text not null check (fabric_unit in ('متر', 'توب')),
  technical_notes text not null default '',
  model_image_url text default '',
  status text not null default 'pending' check (status in ('pending', 'added_to_models', 'sent_to_sewing', 'rejected')),
  approved_order_id uuid references public.orders (id) on delete set null,
  approved_action text check (approved_action in ('add_to_models', 'send_to_sewing')),
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

alter table public.factory_cutting_stories
  add column if not exists customer_name text not null default '',
  add column if not exists source_order_id uuid references public.orders (id) on delete set null,
  add column if not exists factory_model_code text not null default '',
  add column if not exists fabric_details text not null default '',
  add column if not exists approved_order_id uuid references public.orders (id) on delete set null,
  add column if not exists approved_action text,
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_by uuid references auth.users (id) on delete set null,
  add column if not exists rejected_at timestamptz;
alter table public.factory_cutting_stories
  alter column model_image_url drop not null,
  drop constraint if exists factory_cutting_stories_status_check,
  add constraint factory_cutting_stories_status_check
    check (status in ('pending', 'added_to_models', 'sent_to_sewing', 'rejected'));
create index if not exists factory_cutting_stories_status_created_idx
  on public.factory_cutting_stories (status, created_at desc);

update public.production_stages as stage
set fabric_details = story.fabric_details
from public.factory_cutting_stories as story
where stage.order_id = story.approved_order_id
  and stage.stage_name = 'cutting'
  and stage.fabric_details = ''
  and coalesce(story.fabric_details, '') <> '';

alter table public.factory_fabrics
  drop constraint if exists factory_fabrics_stock_scope_check,
  add constraint factory_fabrics_stock_scope_check
    check (stock_scope in ('owner', 'incoming'));

create table if not exists public.factory_fabric_transactions (
  id uuid primary key default gen_random_uuid(),
  fabric_id uuid not null references public.factory_fabrics (id) on delete restrict,
  order_id uuid references public.orders (id) on delete set null,
  transaction_type text not null check (transaction_type in ('receipt', 'withdrawal', 'return', 'adjustment_in', 'adjustment_out')),
  quantity numeric(14, 3) not null check (quantity > 0),
  notes text not null default '',
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.factory_fabric_transactions
  drop constraint if exists factory_fabric_transactions_transaction_type_check,
  add constraint factory_fabric_transactions_transaction_type_check
    check (transaction_type in ('receipt', 'withdrawal', 'return', 'adjustment_in', 'adjustment_out'));

create table if not exists public.factory_live_signals (
  id text primary key,
  order_id uuid,
  client_id uuid,
  worker_id uuid,
  client_record_id uuid,
  signal_type text not null check (signal_type in ('order', 'stage', 'client')),
  changed_at timestamptz not null default now()
);

alter table public.factory_live_signals
  alter column order_id drop not null,
  add column if not exists client_id uuid,
  add column if not exists worker_id uuid,
  add column if not exists client_record_id uuid,
  drop constraint if exists factory_live_signals_signal_type_check,
  add constraint factory_live_signals_signal_type_check
    check (signal_type in ('order', 'stage', 'client'));

create or replace function public.admin_link_factory_staff_account(
  requested_profile_user_id uuid,
  requested_pending_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_profile public.users%rowtype;
  pending_profile public.users%rowtype;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only an active factory admin may link staff accounts.';
  end if;
  if requested_profile_user_id is null
    or requested_pending_user_id is null
    or requested_profile_user_id = requested_pending_user_id then
    raise exception 'Choose two different staff profiles.';
  end if;

  select *
    into staff_profile
  from public.users
  where id = requested_profile_user_id
  for update;
  if not found
    or staff_profile.status <> 'active'
    or staff_profile.role not in ('worker', 'cutting', 'sewing') then
    raise exception 'The selected staff profile is not active.';
  end if;

  select *
    into pending_profile
  from public.users
  where id = requested_pending_user_id
  for update;
  if not found
    or pending_profile.status <> 'pending'
    or pending_profile.role is not null then
    raise exception 'The new login is no longer pending.';
  end if;

  update public.production_stages
  set worker_id = requested_pending_user_id,
      updated_at = now()
  where worker_id = requested_profile_user_id;

  update public.factory_records
  set owner_id = requested_pending_user_id,
      updated_at = now()
  where owner_id = requested_profile_user_id;

  update public.factory_worker_production_submissions
  set worker_id = requested_pending_user_id,
      updated_at = now()
  where worker_id = requested_profile_user_id;

  update public.factory_live_signals
  set worker_id = requested_pending_user_id
  where worker_id = requested_profile_user_id;

  update public.users
  set name = staff_profile.name,
      role = staff_profile.role,
      status = 'active',
      job_title = staff_profile.job_title,
      can_submit_production = staff_profile.can_submit_production,
      updated_at = now()
  where id = requested_pending_user_id
    and status = 'pending'
    and role is null;
  if not found then
    raise exception 'The new login changed before the staff profile could be linked.';
  end if;

  update public.users
  set role = null,
      status = 'suspended',
      can_submit_production = false,
      updated_at = now()
  where id = requested_profile_user_id;
end;
$$;

revoke all on function public.admin_link_factory_staff_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_link_factory_staff_account(uuid, uuid) to authenticated;

create table if not exists public.factory_auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (event_type in ('login', 'signup')),
  occurred_at timestamptz not null default now()
);

create or replace function public.record_factory_auth_event(requested_event_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'An authenticated session is required to record this event.';
  end if;
  if requested_event_type is null or requested_event_type not in ('login', 'signup') then
    raise exception 'Unsupported authentication event.';
  end if;

  insert into public.factory_auth_events (user_id, event_type)
  values (auth.uid(), requested_event_type)
  returning id into saved_event_id;
  return saved_event_id;
end;
$$;

create or replace function public.reset_factory_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can reset factory data.';
  end if;

  perform set_config('factory.reset_in_progress', 'on', true);
  delete from public.factory_auth_events where id is not null;
  delete from public.factory_finished_goods where id is not null;
  delete from public.factory_worker_production_submissions where id is not null;
  delete from public.factory_fabric_transactions where id is not null;
  delete from public.factory_deliveries where id is not null;
  delete from public.factory_cash_transactions where id is not null;
  delete from public.factory_records where id is not null;
  delete from public.production_stages where id is not null;
  delete from public.orders where id is not null;
  delete from public.factory_fabrics where id is not null;
  delete from public.factory_clients where id is not null;
  delete from public.factory_live_signals where id is not null;
  delete from public.users
  where id <> auth.uid();
  delete from auth.users
  where id <> auth.uid();
end;
$$;

revoke all on function public.record_factory_auth_event(text) from public, anon, authenticated;
revoke all on function public.reset_factory_data() from public, anon, authenticated;
grant execute on function public.reset_factory_data() to authenticated;

alter table public.factory_fabrics enable row level security;
alter table public.factory_fabric_transactions enable row level security;
alter table public.factory_cutting_stories enable row level security;

drop policy if exists "Admins read factory cutting stories" on public.factory_cutting_stories;
create policy "Admins read factory cutting stories"
  on public.factory_cutting_stories for select to authenticated
  using (public.is_active_factory_admin());
alter table public.factory_live_signals enable row level security;
alter table public.factory_auth_events enable row level security;
revoke all on public.factory_fabrics, public.factory_fabric_transactions from public, anon, authenticated;
revoke all on public.factory_live_signals from public, anon, authenticated;
revoke all on public.factory_auth_events from public, anon, authenticated;

create index if not exists factory_fabrics_scope_name_color_idx
  on public.factory_fabrics (stock_scope, name, color_hex);
create index if not exists factory_fabrics_customer_idx
  on public.factory_fabrics (customer_id, received_at desc)
  where stock_scope = 'incoming';
create index if not exists factory_fabric_transactions_fabric_date_idx
  on public.factory_fabric_transactions (fabric_id, created_at desc);
create index if not exists factory_fabric_transactions_order_idx
  on public.factory_fabric_transactions (order_id, created_at desc);
create index if not exists factory_live_signals_order_idx
  on public.factory_live_signals (order_id);
create index if not exists factory_live_signals_client_idx
  on public.factory_live_signals (client_id)
  where client_id is not null;
create index if not exists factory_live_signals_worker_idx
  on public.factory_live_signals (worker_id)
  where worker_id is not null;
create index if not exists factory_auth_events_date_idx
  on public.factory_auth_events (occurred_at desc);

update public.factory_live_signals as signal
set client_id = factory_order.client_id
from public.orders as factory_order
where signal.client_id is null
  and signal.order_id = factory_order.id;

update public.factory_live_signals as signal
set worker_id = production_stage.worker_id
from public.production_stages as production_stage
where signal.signal_type = 'stage'
  and signal.worker_id is null
  and signal.id = 'stage:' || production_stage.id::text;

create or replace function public.emit_factory_live_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_order_id uuid;
  changed_client_id uuid;
  changed_worker_id uuid;
  signal_key text;
  changed_type text;
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'orders' then
      changed_order_id := old.id;
      changed_client_id := old.client_id;
      signal_key := 'order:' || old.id::text;
      changed_type := 'order';
    else
      changed_order_id := old.order_id;
      changed_worker_id := old.worker_id;
      select factory_order.client_id
        into changed_client_id
      from public.orders as factory_order
      where factory_order.id = changed_order_id;
      signal_key := 'stage:' || old.id::text;
      changed_type := 'stage';
    end if;
  else
    if tg_table_name = 'orders' then
      changed_order_id := new.id;
      changed_client_id := new.client_id;
      signal_key := 'order:' || new.id::text;
      changed_type := 'order';
    else
      changed_order_id := new.order_id;
      changed_worker_id := new.worker_id;
      select factory_order.client_id
        into changed_client_id
      from public.orders as factory_order
      where factory_order.id = changed_order_id;
      signal_key := 'stage:' || new.id::text;
      changed_type := 'stage';
    end if;
  end if;

  insert into public.factory_live_signals (id, order_id, client_id, worker_id, signal_type, changed_at)
  values (signal_key, changed_order_id, changed_client_id, changed_worker_id, changed_type, now())
  on conflict (id) do update
  set order_id = excluded.order_id,
      client_id = excluded.client_id,
      worker_id = excluded.worker_id,
      signal_type = excluded.signal_type,
      changed_at = excluded.changed_at;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.emit_factory_live_signal() from public, anon, authenticated;

create or replace function public.emit_factory_client_live_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_client_record_id uuid;
  signal_key text;
begin
  if tg_op = 'DELETE' then
    changed_client_record_id := old.id;
  else
    changed_client_record_id := new.id;
  end if;
  signal_key := 'client:' || changed_client_record_id::text;

  insert into public.factory_live_signals (
    id, order_id, client_id, worker_id, client_record_id, signal_type, changed_at
  )
  values (signal_key, null, null, null, changed_client_record_id, 'client', now())
  on conflict (id) do update
  set client_record_id = excluded.client_record_id,
      signal_type = excluded.signal_type,
      changed_at = excluded.changed_at;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.emit_factory_client_live_signal() from public, anon, authenticated;

create or replace function public.emit_factory_cash_client_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_customer_id uuid;
  changed_transaction_id uuid;
  target_client_id uuid;
begin
  if tg_op = 'DELETE' then
    changed_customer_id := old.customer_id;
    changed_transaction_id := old.id;
  else
    changed_customer_id := new.customer_id;
    changed_transaction_id := new.id;
  end if;
  if changed_customer_id is not null then
    select user_id
      into target_client_id
    from public.factory_clients
    where id = changed_customer_id;
    if target_client_id is not null then
      insert into public.factory_live_signals (
        id, client_id, client_record_id, signal_type, changed_at
      )
      values (
        'client-cash:' || changed_transaction_id::text,
        target_client_id,
        changed_transaction_id,
        'client',
        now()
      )
      on conflict (id) do update
      set client_id = excluded.client_id,
          client_record_id = excluded.client_record_id,
          signal_type = excluded.signal_type,
          changed_at = excluded.changed_at;
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.emit_factory_cash_client_signal() from public, anon, authenticated;

drop trigger if exists emit_factory_order_live_signal on public.orders;
create trigger emit_factory_order_live_signal
  after insert or update or delete on public.orders
  for each row execute procedure public.emit_factory_live_signal();

drop trigger if exists emit_factory_stage_live_signal on public.production_stages;
create trigger emit_factory_stage_live_signal
  after insert or update or delete on public.production_stages
  for each row execute procedure public.emit_factory_live_signal();

drop trigger if exists emit_factory_client_live_signal on public.factory_clients;
create trigger emit_factory_client_live_signal
  after insert or update or delete on public.factory_clients
  for each row execute procedure public.emit_factory_client_live_signal();

drop trigger if exists emit_factory_cash_client_signal on public.factory_cash_transactions;
create trigger emit_factory_cash_client_signal
  after insert or update or delete on public.factory_cash_transactions
  for each row execute procedure public.emit_factory_cash_client_signal();

alter table public.production_stages
  drop constraint if exists production_stages_fabric_id_fkey,
  add constraint production_stages_fabric_id_fkey
    foreign key (fabric_id) references public.factory_fabrics (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.production_stages'::regclass
      and conname = 'production_stages_fabric_quantity_nonnegative'
  ) then
    alter table public.production_stages
      add constraint production_stages_fabric_quantity_nonnegative
      check (fabric_quantity >= 0);
  end if;
end;
$$;

create or replace function public.save_factory_fabric(
  requested_fabric_id uuid,
  requested_name text,
  requested_type text,
  requested_color_name text,
  requested_color_hex text,
  requested_unit text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_fabric_id uuid;
  current_unit text;
  current_scope text;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can manage fabric items.';
  end if;
  if length(trim(coalesce(requested_name, ''))) not between 1 and 120
     or length(coalesce(requested_type, '')) > 120
     or length(coalesce(requested_color_name, '')) > 64
     or upper(coalesce(requested_color_hex, '')) !~ '^#[0-9A-F]{6}$'
     or requested_unit is null
     or requested_unit not in ('متر', 'توب') then
    raise exception 'Enter a valid fabric name, type, color, HEX value, and stock unit.';
  end if;

  if requested_fabric_id is null then
    insert into public.factory_fabrics (name, fabric_type, color_name, color_hex, unit)
    values (trim(requested_name), '',
            trim(coalesce(requested_color_name, '')), upper(requested_color_hex), requested_unit)
    returning id into saved_fabric_id;
  else
    select unit, stock_scope into current_unit, current_scope
    from public.factory_fabrics
    where id = requested_fabric_id
    for update;
    if not found then
      raise exception 'Fabric stock item not found.';
    end if;
    if current_unit is distinct from requested_unit and exists (
      select 1 from public.factory_fabric_transactions
      where fabric_id = requested_fabric_id
    ) then
      raise exception 'The stock unit cannot be changed after inventory transactions exist.';
    end if;
    update public.factory_fabrics
    set name = trim(requested_name),
        fabric_type = '',
        color_name = trim(coalesce(requested_color_name, '')),
        color_hex = upper(requested_color_hex),
        unit = requested_unit,
        updated_at = now()
    where id = requested_fabric_id;
    saved_fabric_id := requested_fabric_id;
  end if;
  return saved_fabric_id;
end;
$$;

revoke all on function public.save_factory_fabric(uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.record_factory_fabric_receipt(
  requested_fabric_id uuid,
  requested_quantity numeric,
  requested_received_at timestamptz,
  requested_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_transaction_id uuid;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can record owner fabric inventory.';
  end if;
  if requested_fabric_id is null or requested_quantity is null
     or requested_quantity <= 0 or requested_quantity > 99999999999.999 then
    raise exception 'Select a fabric and enter a positive incoming quantity.';
  end if;

  update public.factory_fabrics
  set quantity_available = quantity_available + requested_quantity,
      updated_at = now()
  where id = requested_fabric_id
    and stock_scope = 'owner';
  if not found then
    raise exception 'Fabric stock item not found.';
  end if;

  insert into public.factory_fabric_transactions (
    fabric_id, transaction_type, quantity, notes, actor_id, created_at
  )
  values (
    requested_fabric_id, 'receipt', requested_quantity,
    coalesce(trim(requested_notes), ''), auth.uid(),
    coalesce(requested_received_at, now())
  )
  returning id into saved_transaction_id;
  return saved_transaction_id;
end;
$$;

revoke all on function public.record_factory_fabric_receipt(uuid, numeric, timestamptz, text) from public, anon, authenticated;

create or replace function public.record_factory_fabric_receipts(
  requested_items jsonb,
  requested_received_at timestamptz,
  requested_notes text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_fabric_id uuid;
  item_quantity numeric;
  saved_count integer := 0;
  receipt_time timestamptz := coalesce(requested_received_at, now());
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can record owner fabric inventory.';
  end if;
  if coalesce(jsonb_typeof(requested_items), '') <> 'array'
     or jsonb_array_length(requested_items) = 0 then
    raise exception 'Add at least one fabric receipt line.';
  end if;

  for item in select value from jsonb_array_elements(requested_items)
  loop
    item_fabric_id := nullif(item ->> 'fabricId', '')::uuid;
    item_quantity := nullif(item ->> 'quantity', '')::numeric;
    if item_fabric_id is null or item_quantity is null or item_quantity <= 0 then
      raise exception 'Each receipt line needs a stock item and a positive quantity.';
    end if;
    update public.factory_fabrics
    set quantity_available = quantity_available + item_quantity,
        updated_at = now()
    where id = item_fabric_id and stock_scope = 'owner';
    if not found then
      raise exception 'Owner fabric stock item % was not found.', item_fabric_id;
    end if;
    insert into public.factory_fabric_transactions (
      fabric_id, transaction_type, quantity, notes, actor_id, created_at
    )
    values (
      item_fabric_id, 'receipt', item_quantity,
      coalesce(trim(requested_notes), ''), auth.uid(), receipt_time
    );
    saved_count := saved_count + 1;
  end loop;
  return saved_count;
end;
$$;

revoke all on function public.record_factory_fabric_receipts(jsonb, timestamptz, text) from public, anon, authenticated;

drop function if exists public.register_factory_incoming_fabric(uuid, text, text, text, text, text, numeric, text, timestamptz, text);
create or replace function public.register_factory_incoming_fabric(
  requested_customer_id uuid,
  requested_name text,
  requested_color_name text,
  requested_color_hex text,
  requested_quantity numeric,
  requested_unit text,
  requested_received_at timestamptz,
  requested_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_fabric_id uuid;
  receipt_time timestamptz := coalesce(requested_received_at, now());
begin
  if not public.has_active_factory_role(array['admin', 'cutting']) then
    raise exception 'Only active admins and cutting supervisors can register incoming fabric.';
  end if;
  if length(trim(coalesce(requested_name, ''))) not between 1 and 120
     or length(coalesce(requested_color_name, '')) > 64
     or upper(coalesce(requested_color_hex, '')) !~ '^#[0-9A-F]{6}$'
     or requested_quantity is null or requested_quantity <= 0
     or requested_quantity > 99999999999.999
     or requested_unit is null or requested_unit not in ('متر', 'توب')
     or (requested_unit = 'توب' and requested_quantity <> trunc(requested_quantity)) then
    raise exception 'Enter valid incoming fabric details and a positive quantity.';
  end if;
  if requested_customer_id is not null and not exists (
    select 1 from public.factory_clients where id = requested_customer_id
  ) then
    raise exception 'Selected client was not found.';
  end if;

  insert into public.factory_fabrics (
    stock_scope, customer_id, name, fabric_type, color_name, color_hex,
    unit, quantity_available, received_at, received_by
  )
  values (
    'incoming', requested_customer_id, trim(requested_name),
    '', trim(coalesce(requested_color_name, '')), upper(requested_color_hex),
    requested_unit, requested_quantity, receipt_time, auth.uid()
  )
  returning id into saved_fabric_id;

  insert into public.factory_fabric_transactions (
    fabric_id, transaction_type, quantity, notes, actor_id, created_at
  )
  values (
    saved_fabric_id, 'receipt', requested_quantity,
    coalesce(trim(requested_notes), ''), auth.uid(), receipt_time
  );
  return saved_fabric_id;
end;
$$;

revoke all on function public.register_factory_incoming_fabric(uuid, text, text, text, numeric, text, timestamptz, text) from public, anon, authenticated;

create or replace function public.register_factory_incoming_fabrics(
  requested_customer_id uuid,
  requested_items jsonb,
  requested_received_at timestamptz,
  requested_notes text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_name text;
  item_color_name text;
  item_color_hex text;
  item_unit text;
  item_quantity numeric;
  saved_fabric_id uuid;
  saved_count integer := 0;
  receipt_time timestamptz := coalesce(requested_received_at, now());
begin
  if not public.has_active_factory_role(array['admin', 'cutting']) then
    raise exception 'Only active admins and cutting supervisors can register incoming fabric.';
  end if;
  if coalesce(jsonb_typeof(requested_items), '') <> 'array'
     or jsonb_array_length(requested_items) = 0 then
    raise exception 'Add at least one incoming fabric line.';
  end if;
  if requested_customer_id is not null and not exists (
    select 1 from public.factory_clients where id = requested_customer_id
  ) then
    raise exception 'Selected client was not found.';
  end if;

  for item in select value from jsonb_array_elements(requested_items)
  loop
    item_name := trim(coalesce(item ->> 'name', ''));
    item_color_name := trim(coalesce(item ->> 'colorName', ''));
    item_color_hex := upper(coalesce(nullif(item ->> 'colorHex', ''), '#FFFFFF'));
    item_unit := item ->> 'unit';
    item_quantity := nullif(item ->> 'quantity', '')::numeric;

    if length(item_name) not between 1 and 120
       or length(item_color_name) > 64
       or item_color_hex !~ '^#[0-9A-F]{6}$'
       or item_quantity is null or item_quantity <= 0 or item_quantity > 99999999999.999
       or item_unit not in ('متر', 'توب')
       or (item_unit = 'توب' and item_quantity <> trunc(item_quantity)) then
      raise exception 'Each incoming fabric line must include valid fabric, color, unit, and positive quantity details.';
    end if;

    insert into public.factory_fabrics (
      stock_scope, customer_id, name, fabric_type, color_name, color_hex,
      unit, quantity_available, received_at, received_by
    )
    values (
      'incoming', requested_customer_id, item_name, '', item_color_name,
      item_color_hex, item_unit, item_quantity, receipt_time, auth.uid()
    )
    returning id into saved_fabric_id;

    insert into public.factory_fabric_transactions (
      fabric_id, transaction_type, quantity, notes, actor_id, created_at
    )
    values (
      saved_fabric_id, 'receipt', item_quantity,
      coalesce(trim(requested_notes), ''), auth.uid(), receipt_time
    );
    saved_count := saved_count + 1;
  end loop;
  return saved_count;
end;
$$;

revoke all on function public.register_factory_incoming_fabrics(uuid, jsonb, timestamptz, text) from public, anon, authenticated;

create or replace function public.assign_factory_incoming_fabric(
  requested_fabric_id uuid,
  requested_customer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can assign incoming fabric to a client.';
  end if;
  if requested_fabric_id is null then
    raise exception 'Select an incoming fabric record.';
  end if;
  if requested_customer_id is not null and not exists (
    select 1 from public.factory_clients where id = requested_customer_id
  ) then
    raise exception 'Selected client was not found.';
  end if;

  update public.factory_fabrics
  set customer_id = requested_customer_id,
      updated_at = now()
  where id = requested_fabric_id
    and stock_scope = 'incoming';
  if not found then
    raise exception 'Incoming fabric record was not found.';
  end if;
end;
$$;

revoke all on function public.assign_factory_incoming_fabric(uuid, uuid) from public, anon, authenticated;

create or replace function public.adjust_factory_fabric_stock(
  requested_fabric_id uuid,
  requested_adjustment numeric,
  requested_adjusted_at timestamptz,
  requested_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_transaction_id uuid;
  adjustment_type text;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can adjust fabric stock.';
  end if;
  if requested_fabric_id is null or requested_adjustment is null
     or requested_adjustment = 0
     or abs(requested_adjustment) > 99999999999.999 then
    raise exception 'Select a fabric and enter a non-zero stock adjustment.';
  end if;

  update public.factory_fabrics
  set quantity_available = quantity_available + requested_adjustment,
      updated_at = now()
  where id = requested_fabric_id
    and stock_scope = 'owner'
    and quantity_available + requested_adjustment >= 0;
  if not found then
    raise exception 'Fabric item not found or the adjustment would make stock negative.';
  end if;

  adjustment_type := case when requested_adjustment > 0 then 'adjustment_in' else 'adjustment_out' end;
  insert into public.factory_fabric_transactions (
    fabric_id, transaction_type, quantity, notes, actor_id, created_at
  )
  values (
    requested_fabric_id, adjustment_type, abs(requested_adjustment),
    coalesce(trim(requested_notes), ''), auth.uid(),
    coalesce(requested_adjusted_at, now())
  )
  returning id into saved_transaction_id;
  return saved_transaction_id;
end;
$$;

revoke all on function public.adjust_factory_fabric_stock(uuid, numeric, timestamptz, text) from public, anon, authenticated;

create or replace function public.record_factory_fabric_withdrawal(
  requested_fabric_id uuid,
  requested_quantity numeric,
  requested_occurred_at timestamptz,
  requested_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Fabric outflow must be recorded through a cutting order.';
end;
$$;

revoke all on function public.record_factory_fabric_withdrawal(uuid, numeric, timestamptz, text) from public, anon, authenticated;

create or replace function public.delete_factory_fabric(requested_fabric_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can delete fabric stock items.';
  end if;
  if requested_fabric_id is null then
    raise exception 'A valid fabric stock item is required.';
  end if;
  perform 1
  from public.factory_fabrics
  where id = requested_fabric_id
  for update;
  if not found then
    raise exception 'Fabric stock item not found.';
  end if;
  if exists (
    select 1
    from public.factory_fabric_transactions
    where fabric_id = requested_fabric_id
      and order_id is not null
  ) then
    raise exception 'Fabric used by a cutting order cannot be deleted; preserve its stock history.';
  end if;
  if exists (
    select 1
    from public.production_stages
    where fabric_id = requested_fabric_id
  ) then
    raise exception 'Fabric referenced by a production stage cannot be deleted; preserve its production history.';
  end if;

  delete from public.factory_fabric_transactions
  where fabric_id = requested_fabric_id;
  delete from public.factory_fabrics
  where id = requested_fabric_id;
end;
$$;

revoke all on function public.delete_factory_fabric(uuid) from public, anon, authenticated;

drop function if exists public.reconcile_factory_fabric_usage(uuid, uuid, numeric);
create or replace function public.reconcile_factory_fabric_usage(
  requested_order_id uuid,
  requested_fabric_id uuid,
  requested_quantity numeric,
  requested_external_source text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_fabric_id uuid;
  prior_quantity numeric(14, 3);
  resolved_fabric public.factory_fabrics%rowtype;
  quantity_delta numeric(14, 3);
  order_customer_id uuid;
begin
  if requested_order_id is null
     or requested_quantity is null or requested_quantity <= 0
     or requested_quantity > 99999999999.999 then
    raise exception 'Select fabric stock or identify an external source and enter a positive amount.';
  end if;

  select fabric_id, fabric_quantity
    into prior_fabric_id, prior_quantity
  from public.production_stages
  where order_id = requested_order_id and stage_name = 'cutting'
  for update;
  if not found then
    raise exception 'The cutting stage for this order does not exist.';
  end if;

  prior_quantity := coalesce(prior_quantity, 0);
  if requested_fabric_id is null then
    if length(trim(coalesce(requested_external_source, ''))) not between 1 and 120 then
      raise exception 'Name the external fabric source.';
    end if;
    if prior_fabric_id is not null and prior_quantity > 0 then
      update public.factory_fabrics
      set quantity_available = quantity_available + prior_quantity,
          updated_at = now()
      where id = prior_fabric_id;
      insert into public.factory_fabric_transactions (
        fabric_id, order_id, transaction_type, quantity, notes, actor_id
      )
      values (prior_fabric_id, requested_order_id, 'return', prior_quantity,
              'إرجاع قماش المخزن عند استخدام خامة خارجية', auth.uid());
    end if;
    return trim(requested_external_source);
  end if;

  select * into resolved_fabric
  from public.factory_fabrics
  where id = requested_fabric_id
  for update;
  if not found then
    raise exception 'Selected fabric stock item not found.';
  end if;
  if resolved_fabric.stock_scope <> 'incoming' then
    raise exception 'Cutting may only use fabric registered as incoming for cutting.';
  end if;
  if resolved_fabric.unit not in ('متر', 'توب') then
    raise exception 'The selected stock item has an unsupported measurement unit.';
  end if;
  if resolved_fabric.unit = 'توب' and requested_quantity <> trunc(requested_quantity) then
    raise exception 'Fabric withdrawn from stock must use a whole number of توب.';
  end if;

  select customer_id into order_customer_id
  from public.orders
  where id = requested_order_id;
  if resolved_fabric.customer_id is null then
    raise exception 'Assign incoming fabric to a client before using it for cutting.';
  end if;
  if resolved_fabric.customer_id is distinct from order_customer_id then
    raise exception 'Incoming fabric is assigned to a different client.';
  end if;

  if prior_fabric_id = requested_fabric_id then
    quantity_delta := requested_quantity - prior_quantity;
    if quantity_delta > 0 then
      update public.factory_fabrics
      set quantity_available = quantity_available - quantity_delta,
          updated_at = now()
      where id = requested_fabric_id and quantity_available >= quantity_delta;
      if not found then
        raise exception 'Not enough fabric remains in stock for this withdrawal.';
      end if;
      insert into public.factory_fabric_transactions (
        fabric_id, order_id, transaction_type, quantity, notes, actor_id
      )
      values (requested_fabric_id, requested_order_id, 'withdrawal', quantity_delta,
              'سحب قماش لطلب القص', auth.uid());
    elsif quantity_delta < 0 then
      update public.factory_fabrics
      set quantity_available = quantity_available + abs(quantity_delta),
          updated_at = now()
      where id = requested_fabric_id;
      insert into public.factory_fabric_transactions (
        fabric_id, order_id, transaction_type, quantity, notes, actor_id
      )
      values (requested_fabric_id, requested_order_id, 'return', abs(quantity_delta),
              'تسوية كمية قماش مستخدمة لطلب القص', auth.uid());
    end if;
  else
    if prior_fabric_id is not null and prior_quantity > 0 then
      update public.factory_fabrics
      set quantity_available = quantity_available + prior_quantity,
          updated_at = now()
      where id = prior_fabric_id;
      insert into public.factory_fabric_transactions (
        fabric_id, order_id, transaction_type, quantity, notes, actor_id
      )
      values (prior_fabric_id, requested_order_id, 'return', prior_quantity,
              'إرجاع قماش عند تغيير خامة طلب القص', auth.uid());
    end if;
    update public.factory_fabrics
    set quantity_available = quantity_available - requested_quantity,
        updated_at = now()
    where id = requested_fabric_id and quantity_available >= requested_quantity;
    if not found then
      raise exception 'Not enough fabric remains in stock for this withdrawal.';
    end if;
    insert into public.factory_fabric_transactions (
      fabric_id, order_id, transaction_type, quantity, notes, actor_id
    )
    values (requested_fabric_id, requested_order_id, 'withdrawal', requested_quantity,
            'سحب قماش لطلب القص', auth.uid());
  end if;
  return resolved_fabric.name;
end;
$$;

revoke all on function public.reconcile_factory_fabric_usage(uuid, uuid, numeric, text) from public, anon, authenticated;

create index if not exists factory_deliveries_customer_date_idx
  on public.factory_deliveries (customer_id, delivered_at desc);
create index if not exists factory_deliveries_order_date_idx
  on public.factory_deliveries (order_id, delivered_at desc);
create unique index if not exists factory_deliveries_legacy_order_idx
  on public.factory_deliveries (order_id)
  where legacy_import;

insert into public.factory_deliveries (
  order_id, customer_id, quantity, price_per_piece, expected_delivery_date, delivered_at, legacy_import
)
select factory_order.id,
       factory_order.customer_id,
       factory_order.delivered_pieces,
       factory_order.price_per_piece,
       factory_order.expected_delivery_date,
       factory_order.created_at,
       true
from public.orders as factory_order
where factory_order.customer_id is not null
  and factory_order.delivered_pieces > 0
on conflict (order_id) where legacy_import do nothing;

update public.factory_deliveries as delivery
set expected_delivery_date = factory_order.expected_delivery_date
from public.orders as factory_order
where delivery.order_id = factory_order.id
  and delivery.expected_delivery_date is null;

drop function if exists public.record_factory_delivery(uuid, integer);
create or replace function public.record_factory_delivery(
  requested_order_id uuid,
  requested_quantity integer,
  requested_recipient_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_customer_id uuid;
  current_order public.orders%rowtype;
  saved_delivery_id uuid;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can record factory deliveries.';
  end if;
  if requested_order_id is null or requested_quantity is null or requested_quantity <= 0
     or length(trim(coalesce(requested_recipient_name, ''))) = 0 then
    raise exception 'A valid order, positive delivery quantity, and recipient name are required.';
  end if;

  select customer_id
    into matched_customer_id
  from public.orders
  where id = requested_order_id;
  if not found or matched_customer_id is null then
    raise exception 'Factory order not found or has no customer.';
  end if;

  perform 1
  from public.factory_clients
  where id = matched_customer_id
  for update;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found or current_order.customer_id <> matched_customer_id then
    raise exception 'Factory order changed while the delivery was being recorded.';
  end if;
  if current_order.archived_at is not null
     or current_order.status = 'تم التسليم' then
    raise exception 'Closed or archived factory orders cannot receive new deliveries.';
  end if;
  if current_order.total_pieces <= 0 then
    raise exception 'Record the actual cut quantity before recording a delivery.';
  end if;
  if current_order.delivered_pieces + requested_quantity > current_order.total_pieces then
    raise exception 'The delivery quantity cannot exceed the remaining cut quantity.';
  end if;

  insert into public.factory_deliveries (
    order_id, customer_id, quantity, price_per_piece, recipient_name, expected_delivery_date
  )
  values (
    current_order.id, current_order.customer_id, requested_quantity, current_order.price_per_piece,
    trim(requested_recipient_name), current_order.expected_delivery_date
  )
  returning id into saved_delivery_id;

  update public.orders
  set delivered_pieces = delivered_pieces + requested_quantity
  where id = current_order.id;

  update public.production_stages
  set target_quantity = greatest(target_quantity, current_order.delivered_pieces + requested_quantity),
      completed_quantity = current_order.delivered_pieces + requested_quantity,
      updated_at = now()
  where order_id = current_order.id
    and stage_name = 'delivery';

  return saved_delivery_id;
end;
$$;

drop function if exists public.complete_factory_handover(uuid, integer, text);
create function public.complete_factory_handover(
  requested_order_id uuid,
  requested_final_batch_qty integer,
  requested_recipient_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  matched_customer_id uuid;
  final_delivered_quantity integer;
  remaining_quantity integer;
  has_prior_deliveries boolean;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can complete factory handovers.';
  end if;
  if requested_order_id is null
     or requested_final_batch_qty is null
     or requested_final_batch_qty < 0 then
    raise exception 'A valid order and nonnegative final delivery batch quantity are required.';
  end if;

  select customer_id
    into matched_customer_id
  from public.orders
  where id = requested_order_id;
  if not found or matched_customer_id is null then
    raise exception 'Factory order not found or has no customer.';
  end if;

  perform 1
  from public.factory_clients
  where id = matched_customer_id
  for update;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found or current_order.customer_id is distinct from matched_customer_id then
    raise exception 'Factory order changed while the handover was being completed.';
  end if;
  if current_order.archived_at is not null then
    raise exception 'Closed or archived factory orders cannot be completed again.';
  end if;
  if current_order.status = 'تم التسليم' then
    raise exception 'Closed factory orders cannot be completed again.';
  end if;
  if current_order.total_pieces <= 0 then
    raise exception 'Record the actual cut quantity before completing the handover.';
  end if;
  remaining_quantity := greatest(current_order.total_pieces - current_order.delivered_pieces, 0);
  select current_order.delivered_pieces > 0 or exists (
    select 1 from public.factory_deliveries
    where order_id = current_order.id
  ) into has_prior_deliveries;
  if requested_final_batch_qty > remaining_quantity then
    raise exception 'The final delivery quantity cannot exceed the remaining order quantity.';
  end if;
  if has_prior_deliveries
     and requested_final_batch_qty not in (0, remaining_quantity) then
    raise exception 'After earlier deliveries, close on the delivered total or deliver the entire remainder.';
  end if;
  if not has_prior_deliveries and requested_final_batch_qty = 0 then
    raise exception 'The first handover must record a positive delivery quantity.';
  end if;
  final_delivered_quantity := current_order.delivered_pieces + requested_final_batch_qty;
  if requested_final_batch_qty > 0 then
    if length(trim(coalesce(requested_recipient_name, ''))) = 0 then
      raise exception 'A recipient name is required when recording an additional delivery.';
    end if;

    insert into public.factory_deliveries (
      order_id, customer_id, quantity, price_per_piece, recipient_name, expected_delivery_date
    )
    values (
      current_order.id, current_order.customer_id, requested_final_batch_qty,
      current_order.price_per_piece, trim(requested_recipient_name),
      current_order.expected_delivery_date
    );
  end if;

  update public.orders
  set delivered_pieces = final_delivered_quantity,
      status = 'تم التسليم'
  where id = current_order.id;

  update public.production_stages
  set target_quantity = greatest(target_quantity, final_delivered_quantity),
      completed_quantity = final_delivered_quantity,
      status = 'مكتمل',
      updated_at = now()
  where order_id = current_order.id
    and stage_name = 'delivery';
end;
$$;

create or replace function public.admin_update_factory_delivery_quantity(
  requested_order_id uuid,
  requested_delivery_id uuid,
  requested_quantity integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  updated_delivered_quantity integer;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can adjust factory delivery quantities.';
  end if;
  if requested_order_id is null or requested_delivery_id is null
     or requested_quantity is null or requested_quantity < 0 then
    raise exception 'A valid order, delivery, and nonnegative quantity are required.';
  end if;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found then
    raise exception 'Factory order not found.';
  end if;
  if current_order.archived_at is not null then
    raise exception 'Archived factory deliveries cannot be adjusted.';
  end if;

  perform 1
  from public.factory_deliveries
  where id = requested_delivery_id
    and order_id = requested_order_id
  for update;
  if not found then
    raise exception 'The delivery does not belong to this factory order.';
  end if;

  if requested_quantity = 0 then
    delete from public.factory_deliveries
    where id = requested_delivery_id
      and order_id = requested_order_id;
  else
    update public.factory_deliveries
    set quantity = requested_quantity
    where id = requested_delivery_id
      and order_id = requested_order_id;
  end if;

  select coalesce(sum(quantity), 0)::integer
    into updated_delivered_quantity
  from public.factory_deliveries
  where order_id = requested_order_id;

  update public.orders
  set delivered_pieces = updated_delivered_quantity,
      status = case
        when updated_delivered_quantity = 0
          and status = 'تم التسليم'
          then 'جاهز للتسليم'
        else status
      end
  where id = requested_order_id;

  update public.production_stages
  set target_quantity = greatest(target_quantity, updated_delivered_quantity),
      completed_quantity = updated_delivered_quantity,
      status = case when updated_delivered_quantity = 0 then 'قيد الانتظار' else status end,
      updated_at = now()
  where order_id = requested_order_id
    and stage_name = 'delivery';

  return updated_delivered_quantity;
end;
$$;

create or replace function public.calculate_factory_cutting_breakdown(
  requested_size_data jsonb,
  requested_color_ply_data jsonb
)
returns table (normalized_sizes jsonb, normalized_colors text, total_pieces integer, total_plys integer)
language plpgsql
immutable
set search_path = public
as $$
declare
  size_type text;
  size_name text;
  selected_sizes text[] := array[]::text[];
  normalized_size_order text[] := array[]::text[];
  selected_colors text[] := array[]::text[];
  expected_counts jsonb := '{}'::jsonb;
  expected_multiplicities jsonb := '{}'::jsonb;
  color_entry jsonb;
  raw_plys text;
  color_name text;
  color_plys numeric;
  plys_sum numeric := 0;
  calculated_total numeric;
begin
  if coalesce(jsonb_typeof(requested_size_data), '') <> 'object'
     or coalesce(jsonb_typeof(requested_color_ply_data), '') <> 'object'
     or coalesce(jsonb_typeof(requested_color_ply_data -> 'sizes'), '') <> 'array'
     or coalesce(jsonb_typeof(requested_color_ply_data -> 'colors'), '') <> 'array' then
    raise exception 'Cutting progress must contain valid size and color arrays.';
  end if;

  size_type := requested_color_ply_data ->> 'type';
  if jsonb_array_length(requested_color_ply_data -> 'sizes') > 0
     and coalesce(size_type, '') not in ('men', 'women', 'children') then
    raise exception 'Select a supported size category.';
  end if;

  for size_name in
    select selected_size.name
    from jsonb_array_elements_text(requested_color_ply_data -> 'sizes')
      with ordinality as selected_size(name, position)
    order by selected_size.position
  loop
    if coalesce(size_type, '') not in ('men', 'women', 'children') then
      raise exception 'Select a supported size category before selecting sizes.';
    end if;
    if (size_type in ('men', 'women') and size_name not in ('XS', 'SX', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'))
       or (size_type = 'children' and size_name not in ('2', '4', '6', '8', '10', '12', '14', '16'))
       then
      raise exception 'The selected size list contains an invalid size.';
    end if;
    selected_sizes := array_append(selected_sizes, case when size_name = 'SX' then 'XS' else size_name end);
  end loop;
  for color_entry in
    select value from jsonb_array_elements(requested_color_ply_data -> 'colors')
  loop
    color_name := upper(trim(coalesce(color_entry ->> 'color', '')));
    raw_plys := trim(coalesce(color_entry ->> 'plys', ''));
    if color_name !~ '^#[0-9A-F]{6}$'
       or raw_plys !~ '^[0-9]+$'
       or length(trim(coalesce(color_entry ->> 'name', ''))) = 0
       or length(trim(coalesce(color_entry ->> 'name', ''))) > 64 then
      raise exception 'Each color must have a name, a valid HEX value, and a positive integer ply count.';
    end if;
    color_plys := raw_plys::numeric;
    if color_plys < 1 or color_plys > 2147483647
       or color_name = any(selected_colors) then
      raise exception 'Color ply counts must be positive, within range, and colors must be unique.';
    end if;
    plys_sum := plys_sum + color_plys;
    if plys_sum > 2147483647 then
      raise exception 'The total number of color plys exceeds the supported quantity.';
    end if;
    selected_colors := array_append(selected_colors, color_name);
  end loop;
  calculated_total := case
    when cardinality(selected_colors) = 0 or cardinality(selected_sizes) = 0 then 0
    else plys_sum * cardinality(selected_sizes)
  end;
  if calculated_total < 0 or calculated_total > 2147483647 then
    raise exception 'The calculated cutting quantity exceeds the supported range.';
  end if;
  foreach size_name in array selected_sizes loop
    normalized_size_order := array_append(normalized_size_order, size_name);
    expected_counts := expected_counts || jsonb_build_object(
      size_name,
      (coalesce(nullif(expected_counts ->> size_name, '')::numeric, 0) + plys_sum)::integer::text
    );
    expected_multiplicities := expected_multiplicities || jsonb_build_object(
      size_name,
      coalesce(nullif(expected_multiplicities ->> size_name, '')::integer, 0) + 1
    );
  end loop;
  normalized_sizes := jsonb_build_object(
    'type', size_type,
    'counts', expected_counts,
    'multiplicities', expected_multiplicities,
    'sizes', to_jsonb(normalized_size_order)
  );
  if cardinality(selected_colors) > 0
     and cardinality(selected_sizes) > 0
     and requested_size_data is distinct from normalized_sizes then
    raise exception 'The supplied size quantities do not match the selected sizes and color ply counts.';
  end if;
  normalized_colors := array_to_string(selected_colors, ', ');
  total_pieces := calculated_total::integer;
  total_plys := plys_sum::integer;
  return next;
end;
$$;

drop function if exists public.submit_factory_cutting(uuid, text, text, jsonb, text, text, text, integer, integer, text);
drop function if exists public.submit_factory_cutting(uuid, uuid, text, text, jsonb, text, text, text, integer, integer, text);
drop function if exists public.submit_factory_cutting(uuid, uuid, text, text, jsonb, jsonb, text, text, integer, text);
drop function if exists public.submit_factory_cutting(uuid, uuid, text, text, jsonb, jsonb, text, text, integer, text, uuid, numeric);
drop function if exists public.submit_factory_cutting(uuid, uuid, text, text, jsonb, jsonb, text, text, integer, text, uuid, numeric, text);
drop function if exists public.submit_factory_cutting(uuid, uuid, text, text, jsonb, jsonb, text, text, text, integer, text, uuid, numeric, text);
drop function if exists public.submit_factory_cutting(uuid, uuid, text, text, jsonb, jsonb, text, text, text, integer, text, uuid, numeric, text, uuid);
drop function if exists public.read_factory_cutting_clients();
create function public.read_factory_cutting_clients()
returns table (id uuid, name text, brand_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_active_factory_role(array['cutting']) then
    raise exception 'Only active cutting supervisors can read the client list.';
  end if;

  return query
    select customer.id, customer.name, customer.brand_name
    from public.factory_clients as customer
    order by customer.name;
end;
$$;

create function public.submit_factory_cutting(
  requested_order_id uuid,
  requested_customer_id uuid,
  requested_model_name text,
  requested_model_number text,
  requested_size_data jsonb,
  requested_color_ply_data jsonb,
  requested_model_image_url text,
  requested_fabric text,
  requested_fabric_details text,
  requested_bolt_count integer,
  requested_technical_notes text,
  requested_fabric_id uuid,
  requested_fabric_quantity numeric,
  requested_external_fabric_unit text,
  requested_source_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_customer public.factory_clients%rowtype;
  source_model public.orders%rowtype;
  selected_fabric public.factory_fabrics%rowtype;
  submitted_by_name text;
  normalized_sizes jsonb;
  normalized_colors text;
  cut_total integer;
  total_plys integer;
  fabric_unit text;
begin
  if not (
    public.is_active_factory_admin()
    or public.has_active_factory_role(array['cutting'])
  ) then
    raise exception 'Only active admins or cutting supervisors can submit new cutting orders.';
  end if;
  if requested_order_id is null
     or requested_customer_id is null
     or (length(trim(coalesce(requested_model_name, ''))) = 0
         and length(trim(coalesce(requested_model_number, ''))) = 0)
     or requested_size_data is null
     or coalesce(jsonb_typeof(requested_size_data), '') <> 'object'
     or requested_color_ply_data is null
     or coalesce(jsonb_typeof(requested_color_ply_data), '') <> 'object'
     or coalesce(jsonb_typeof(requested_color_ply_data -> 'colors'), '') <> 'array'
     or coalesce(jsonb_typeof(requested_color_ply_data -> 'sizes'), '') <> 'array'
     or coalesce(requested_color_ply_data ->> 'type', '') not in ('men', 'women', 'children')
     or length(trim(coalesce(requested_fabric, ''))) = 0
     or length(trim(coalesce(requested_fabric_details, ''))) > 240
     or length(trim(coalesce(requested_technical_notes, ''))) > 2000
     or requested_bolt_count is null or requested_bolt_count < 0
     or requested_fabric_quantity is null or requested_fabric_quantity <= 0 then
    raise exception 'A valid model, fabric, and positive fabric quantity are required.';
  end if;
  if jsonb_array_length(requested_color_ply_data -> 'colors') = 0
     or jsonb_array_length(requested_color_ply_data -> 'sizes') = 0 then
    raise exception 'A complete cutting story requires at least one size and one color with a positive ply count.';
  end if;
  if requested_fabric_id is null
     and coalesce(nullif(trim(requested_external_fabric_unit), ''), '') not in ('متر', 'توب') then
    raise exception 'Choose متر or توب for the external fabric quantity.';
  end if;
  if requested_fabric_id is null
     and ((requested_external_fabric_unit = 'توب'
           and (requested_fabric_quantity <> trunc(requested_fabric_quantity)
             or requested_bolt_count::numeric <> requested_fabric_quantity))
       or (requested_external_fabric_unit = 'متر' and requested_bolt_count <> 0)) then
    raise exception 'External cutting quantity and its selected unit do not match.';
  end if;
  if requested_fabric_id is not null then
    select * into selected_fabric
    from public.factory_fabrics where id = requested_fabric_id
    for update;
    if not found
       or selected_fabric.stock_scope <> 'incoming'
       or selected_fabric.customer_id <> requested_customer_id
       or selected_fabric.unit not in ('متر', 'توب')
       or selected_fabric.quantity_available < requested_fabric_quantity
       or (selected_fabric.unit = 'توب'
           and (requested_fabric_quantity <> trunc(requested_fabric_quantity)
             or requested_bolt_count::numeric <> requested_fabric_quantity))
       or (selected_fabric.unit = 'متر' and requested_bolt_count <> 0) then
      raise exception 'The cutting quantity must match the stock item measurement unit.';
    end if;
    fabric_unit := selected_fabric.unit;
  else
    fabric_unit := requested_external_fabric_unit;
  end if;

  select *
    into matched_customer
  from public.factory_clients
  where id = requested_customer_id
  for key share;
  if not found then
    raise exception 'The selected factory customer does not exist.';
  end if;

  if requested_source_order_id is not null then
    select * into source_model
    from public.orders
    where id = requested_source_order_id
      and customer_id = matched_customer.id
      and factory_model_code is not null
    for key share;
    if not found then
      raise exception 'The source model could not be found for the selected client.';
    end if;
  end if;

  select coalesce(nullif(trim(name), ''), username)
    into submitted_by_name
  from public.users
  where id = auth.uid()
    and role in ('admin', 'cutting')
    and status = 'active';
  if not found then
    raise exception 'The active admin or cutting supervisor profile could not be identified.';
  end if;

  select breakdown.normalized_sizes, breakdown.normalized_colors,
         breakdown.total_pieces, breakdown.total_plys
    into normalized_sizes, normalized_colors, cut_total, total_plys
  from public.calculate_factory_cutting_breakdown(requested_size_data, requested_color_ply_data) as breakdown;
  if cut_total < 1 or total_plys < 1 then
    raise exception 'A complete cutting story requires at least one size, one color, and a positive ply count.';
  end if;

  insert into public.factory_cutting_stories (
    id, customer_id, customer_name, submitted_by, submitted_by_name,
    model_name, model_number, source_order_id, factory_model_code, size_data, color_ply_data, total_pieces, ply_count,
    fabric, fabric_details, fabric_id, fabric_quantity, bolt_count, fabric_unit,
    technical_notes, model_image_url
  )
  values (
    requested_order_id, matched_customer.id, matched_customer.name, auth.uid(), submitted_by_name,
    case when requested_source_order_id is not null then
      coalesce(nullif(trim(source_model.model_name), ''), nullif(trim(source_model.model_number), ''), requested_model_name)
      else coalesce(nullif(trim(coalesce(requested_model_name, '')), ''),
                    nullif(trim(coalesce(requested_model_number, '')), '')) end,
    coalesce(trim(requested_model_number), ''),
    requested_source_order_id, coalesce(source_model.factory_model_code, ''),
    normalized_sizes, requested_color_ply_data, cut_total, total_plys,
    trim(requested_fabric), trim(coalesce(requested_fabric_details, '')),
    requested_fabric_id, requested_fabric_quantity, requested_bolt_count, fabric_unit,
    trim(coalesce(requested_technical_notes, '')),
    coalesce(nullif(trim(coalesce(requested_model_image_url, '')), ''),
      case when requested_source_order_id is not null then source_model.model_image_url end, '')
  );

  return cut_total;
end;
$$;

create or replace function public.admin_approve_factory_cutting_story(
  requested_story_id uuid,
  requested_action text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  story public.factory_cutting_stories%rowtype;
  customer public.factory_clients%rowtype;
  source_model public.orders%rowtype;
  resolved_parent_order_id uuid;
  resolved_model_serial bigint;
  new_order_id uuid := gen_random_uuid();
  resolved_fabric_name text;
  order_status text;
  colors text;
  color_names jsonb;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can approve cutting stories.';
  end if;
  if requested_story_id is null
     or requested_action is null
     or requested_action not in ('add_to_models', 'send_to_sewing') then
    raise exception 'Choose a valid cutting story and approval action.';
  end if;

  select *
    into story
  from public.factory_cutting_stories
  where id = requested_story_id
  for update;
  if not found then
    raise exception 'The cutting story was not found.';
  end if;
  if story.status <> 'pending' or story.approved_order_id is not null then
    raise exception 'This cutting story has already been reviewed.';
  end if;
  if story.customer_id is null then
    raise exception 'The original client profile is no longer available.';
  end if;
  if story.source_order_id is not null then
    select * into source_model
    from public.orders
    where id = story.source_order_id
      and customer_id = story.customer_id
    for key share;
    if not found then
      raise exception 'The source model for this cutting story no longer exists.';
    end if;
    resolved_parent_order_id := coalesce(source_model.parent_order_id, source_model.id);
    resolved_model_serial := source_model.model_serial;
  end if;
  if story.fabric_id is not null then
    perform 1 from public.factory_fabrics where id = story.fabric_id for update;
    if not found then
      raise exception 'The selected fabric stock item no longer exists.';
    end if;
  end if;

  select *
    into customer
  from public.factory_clients
  where id = story.customer_id
  for key share;
  if not found then
    raise exception 'The original client profile no longer exists.';
  end if;

  select coalesce(string_agg(upper(trim(entry.value ->> 'color')), ', '), ''),
         coalesce(jsonb_object_agg(upper(trim(entry.value ->> 'color')), trim(entry.value ->> 'name'))
           filter (where length(trim(coalesce(entry.value ->> 'name', ''))) > 0), '{}'::jsonb)
    into colors, color_names
  from jsonb_array_elements(story.color_ply_data -> 'colors') as entry(value);

  order_status := case
    when requested_action = 'send_to_sewing' then 'في انتظار الخياطة'
    else 'تم القص'
  end;
  insert into public.orders (
    id, client_id, customer_id, model_name, model_number, model_serial, parent_order_id, client_model_code, sender_name,
    colors, color_names, sizes, original_total_pieces, total_pieces,
    status, model_image_url, work_stages
  )
  values (
    new_order_id, customer.user_id, customer.id, story.model_name, '',
    resolved_model_serial, resolved_parent_order_id,
    coalesce(trim(story.model_number), ''),
    story.submitted_by_name, colors, color_names, story.size_data::text,
    story.total_pieces, story.total_pieces, order_status,
    nullif(trim(story.model_image_url), ''),
    array['cutting', 'sewing', 'finishing']::text[]
  );

  resolved_fabric_name := public.reconcile_factory_fabric_usage(
    new_order_id, story.fabric_id, story.fabric_quantity, story.fabric
  );

  update public.production_stages
  set target_quantity = story.total_pieces,
      completed_quantity = story.total_pieces,
      fabric = resolved_fabric_name,
      fabric_details = story.fabric_details,
      fabric_id = story.fabric_id,
      external_fabric_source = case when story.fabric_id is null then story.fabric else '' end,
      external_fabric_unit = case when story.fabric_id is null then story.fabric_unit else '' end,
      fabric_quantity = story.fabric_quantity,
      bolt_count = story.bolt_count,
      layer_count = story.ply_count,
      color_ply_data = story.color_ply_data,
      technical_notes = story.technical_notes,
      status = 'مكتمل',
      updated_at = now()
  where order_id = new_order_id and stage_name = 'cutting';
  if not found then
    raise exception 'The cutting stage could not be created for this story.';
  end if;

  if requested_action = 'send_to_sewing' then
    update public.production_stages
    set status = 'متاح للخياطة',
        updated_at = now()
    where order_id = new_order_id and stage_name = 'sewing';
    if not found then
      raise exception 'The sewing stage could not be created for this story.';
    end if;
  end if;

  update public.factory_cutting_stories
  set status = case when requested_action = 'send_to_sewing' then 'sent_to_sewing' else 'added_to_models' end,
      approved_order_id = new_order_id,
      approved_action = requested_action,
      approved_by = auth.uid(),
      approved_at = now()
  where id = story.id and status = 'pending';
  if not found then
    raise exception 'The cutting story changed while it was being approved.';
  end if;
  return new_order_id;
end;
$$;

create or replace function public.admin_reject_factory_cutting_story(
  requested_story_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can reject cutting stories.';
  end if;
  if requested_story_id is null then
    raise exception 'Choose a valid cutting story to reject.';
  end if;

  update public.factory_cutting_stories
  set status = 'rejected',
      rejected_by = auth.uid(),
      rejected_at = now()
  where id = requested_story_id
    and status = 'pending'
    and approved_order_id is null;
  if not found then
    raise exception 'The cutting story was not found or has already been reviewed.';
  end if;
end;
$$;

drop function if exists public.update_factory_cutting_progress(uuid, jsonb, jsonb, text, integer, text);
drop function if exists public.update_factory_cutting_progress(uuid, jsonb, jsonb, text, integer, text, uuid, numeric);
drop function if exists public.update_factory_cutting_progress(uuid, jsonb, jsonb, text, integer, text, uuid, numeric, text);
create function public.update_factory_cutting_progress(
  requested_order_id uuid,
  requested_size_data jsonb,
  requested_color_ply_data jsonb,
  requested_fabric text,
  requested_bolt_count integer,
  requested_technical_notes text,
  requested_fabric_id uuid,
  requested_fabric_quantity numeric,
  requested_external_fabric_unit text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  normalized_sizes jsonb;
  normalized_colors text;
  calculated_total integer;
  total_plys integer;
  resolved_fabric_name text;
  resolved_fabric_unit text;
begin
  if not public.has_active_factory_role(array['cutting']) then
    raise exception 'Only active cutting supervisors can update cutting progress.';
  end if;
  if requested_order_id is null
     or length(trim(coalesce(requested_fabric, ''))) = 0
     or requested_bolt_count is null or requested_bolt_count < 0
     or requested_fabric_quantity is null or requested_fabric_quantity <= 0 then
    raise exception 'A valid order, fabric, and positive fabric quantity are required.';
  end if;
  if requested_fabric_id is null
     and coalesce(nullif(trim(requested_external_fabric_unit), ''), '') not in ('متر', 'توب') then
    raise exception 'Choose متر or توب for the external fabric quantity.';
  end if;
  if requested_fabric_id is null
     and ((requested_external_fabric_unit = 'توب'
           and (requested_fabric_quantity <> trunc(requested_fabric_quantity)
             or requested_bolt_count::numeric <> requested_fabric_quantity))
       or (requested_external_fabric_unit = 'متر' and requested_bolt_count <> 0)) then
    raise exception 'External cutting quantity and its selected unit do not match.';
  end if;
  if requested_fabric_id is not null then
    select unit into resolved_fabric_unit
    from public.factory_fabrics where id = requested_fabric_id
    for update;
    if not found or resolved_fabric_unit not in ('متر', 'توب')
       or (resolved_fabric_unit = 'توب'
           and (requested_fabric_quantity <> trunc(requested_fabric_quantity)
             or requested_bolt_count::numeric <> requested_fabric_quantity))
       or (resolved_fabric_unit = 'متر' and requested_bolt_count <> 0) then
      raise exception 'The cutting quantity must match the stock item measurement unit.';
    end if;
  end if;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found or current_order.archived_at is not null
     or current_order.status in ('مكتمل', 'تم التسليم') then
    raise exception 'This order is not accepting live cutting updates.';
  end if;

  select breakdown.normalized_sizes, breakdown.normalized_colors,
         breakdown.total_pieces, breakdown.total_plys
    into normalized_sizes, normalized_colors, calculated_total, total_plys
  from public.calculate_factory_cutting_breakdown(requested_size_data, requested_color_ply_data) as breakdown;

  resolved_fabric_name := public.reconcile_factory_fabric_usage(
    requested_order_id, requested_fabric_id, requested_fabric_quantity, requested_fabric
  );

  update public.orders
  set colors = coalesce(normalized_colors, ''),
      color_names = coalesce((
        select jsonb_object_agg(upper(trim(color_entry ->> 'color')), trim(color_entry ->> 'name'))
        from jsonb_array_elements(requested_color_ply_data -> 'colors') as color_entry
        where length(trim(coalesce(color_entry ->> 'name', ''))) > 0
      ), '{}'::jsonb),
      sizes = normalized_sizes::text
  where id = requested_order_id;

  update public.production_stages
  set fabric = resolved_fabric_name,
      fabric_id = requested_fabric_id,
      external_fabric_source = case when requested_fabric_id is null then resolved_fabric_name else '' end,
      external_fabric_unit = case when requested_fabric_id is null then coalesce(nullif(trim(requested_external_fabric_unit), ''), 'متر') else '' end,
      fabric_quantity = requested_fabric_quantity,
      bolt_count = requested_bolt_count,
      layer_count = total_plys,
      color_ply_data = requested_color_ply_data,
      technical_notes = coalesce(nullif(trim(requested_technical_notes), ''), technical_notes),
      status = 'قيد الفرش',
      updated_at = now()
  where order_id = requested_order_id
    and stage_name = 'cutting';
  if not found then
    raise exception 'The cutting stage for this order does not exist.';
  end if;

  update public.orders
  set status = 'تم الفرش'
  where id = requested_order_id
    and status not in ('تم القص', 'جاري الخياطة', 'مكتمل', 'جاهز للتسليم', 'تم التسليم');

  return total_plys;
end;
$$;

drop function if exists public.mark_factory_cutting_ready(uuid);
create function public.mark_factory_cutting_ready(requested_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  current_layer_count integer;
  current_cutting_data jsonb;
begin
  if not public.has_active_factory_role(array['cutting']) then
    raise exception 'Only active cutting supervisors can mark a bed ready for cutting.';
  end if;
  if requested_order_id is null then
    raise exception 'A valid factory order is required.';
  end if;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found or current_order.archived_at is not null
     or current_order.status in ('مكتمل', 'تم التسليم') then
    raise exception 'The active factory order was not found.';
  end if;

  select layer_count, color_ply_data
    into current_layer_count, current_cutting_data
  from public.production_stages
  where order_id = requested_order_id
    and stage_name = 'cutting'
  for update;
  if not found or current_layer_count < 1 then
    raise exception 'Select at least one size and save a positive color ply before marking the bed ready.';
  end if;
  if coalesce(jsonb_typeof(current_cutting_data -> 'sizes'), '') <> 'array'
     or coalesce(jsonb_typeof(current_cutting_data -> 'colors'), '') <> 'array' then
    raise exception 'Select at least one size and save a positive color ply before marking the bed ready.';
  end if;
  if jsonb_array_length(current_cutting_data -> 'sizes') = 0
     or jsonb_array_length(current_cutting_data -> 'colors') = 0 then
    raise exception 'Select at least one size and save a positive color ply before marking the bed ready.';
  end if;

  update public.production_stages
  set status = 'جاهز للقص',
      updated_at = now()
  where order_id = requested_order_id
    and stage_name = 'cutting';

  update public.orders
  set status = 'جاهز للقص'
  where id = requested_order_id;
end;
$$;

drop function if exists public.finish_factory_cutting(uuid, jsonb, text, text);
drop function if exists public.finish_factory_cutting(uuid, jsonb, text, text, text, integer, integer);
drop function if exists public.finish_factory_cutting(uuid, jsonb, text, text, text, integer, integer, text);
drop function if exists public.finish_factory_cutting(uuid, jsonb, jsonb, text, text, integer, text);
drop function if exists public.finish_factory_cutting(uuid, jsonb, jsonb, text, text, integer, text, uuid, numeric);
drop function if exists public.finish_factory_cutting(uuid, jsonb, jsonb, text, text, integer, text, uuid, numeric, text);
drop function if exists public.finish_factory_cutting(uuid, jsonb, jsonb, text, text, integer, text, uuid, numeric, text, text);
create function public.finish_factory_cutting(
  requested_order_id uuid,
  requested_size_data jsonb,
  requested_color_ply_data jsonb,
  requested_model_image_url text,
  requested_fabric text,
  requested_bolt_count integer,
  requested_technical_notes text,
  requested_fabric_id uuid,
  requested_fabric_quantity numeric,
  requested_external_fabric_unit text,
  requested_cutter_name text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  current_cutting_stage public.production_stages%rowtype;
  normalized_sizes jsonb;
  normalized_colors text;
  cut_total integer;
  total_plys integer;
  resolved_fabric_name text;
  resolved_fabric_unit text;
  has_saved_fabric boolean;
begin
  if not public.has_active_factory_role(array['cutting']) then
    raise exception 'Only active cutting supervisors can finish cutting.';
  end if;
  if requested_order_id is null or requested_size_data is null
     or coalesce(jsonb_typeof(requested_size_data), '') <> 'object'
     or length(trim(coalesce(requested_cutter_name, ''))) > 120 then
    raise exception 'A valid order, cutting breakdown, and cutter name are required.';
  end if;
  if coalesce(jsonb_typeof(requested_color_ply_data), '') <> 'object'
     or coalesce(jsonb_typeof(requested_color_ply_data -> 'colors'), '') <> 'array'
     or coalesce(jsonb_typeof(requested_color_ply_data -> 'sizes'), '') <> 'array'
     or coalesce(requested_color_ply_data ->> 'type', '') not in ('men', 'women', 'children') then
    raise exception 'Select sizes and add at least one color with a positive ply count before finishing.';
  end if;
  if jsonb_array_length(requested_color_ply_data -> 'colors') = 0
     or jsonb_array_length(requested_color_ply_data -> 'sizes') = 0 then
    raise exception 'Select sizes and add at least one color with a positive ply count before finishing.';
  end if;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found or current_order.archived_at is not null
     or current_order.status in ('مكتمل', 'تم التسليم') then
    raise exception 'The active factory order was not found.';
  end if;

  select *
    into current_cutting_stage
  from public.production_stages
  where order_id = requested_order_id
    and stage_name = 'cutting'
  for update;
  if not found then
    raise exception 'Mark the bed ready for cutting before recording its final piece count.';
  end if;
  if current_cutting_stage.status <> 'جاهز للقص'
     and current_order.status <> 'جاهز للقص' then
    raise exception 'Mark the bed ready for cutting before recording its final piece count.';
  end if;
  if current_cutting_stage.status <> 'جاهز للقص' then
    if current_cutting_stage.layer_count < 1
       or coalesce(jsonb_typeof(current_cutting_stage.color_ply_data -> 'sizes'), '') <> 'array'
       or coalesce(jsonb_typeof(current_cutting_stage.color_ply_data -> 'colors'), '') <> 'array' then
      raise exception 'The cutting bed data is incomplete. Save its sizes and color plys before finishing.';
    end if;
    if jsonb_array_length(current_cutting_stage.color_ply_data -> 'sizes') = 0
       or jsonb_array_length(current_cutting_stage.color_ply_data -> 'colors') = 0 then
      raise exception 'The cutting bed data is incomplete. Save its sizes and color plys before finishing.';
    end if;
  end if;

  has_saved_fabric := current_cutting_stage.fabric_quantity > 0
    and (
      current_cutting_stage.fabric_id is not null
      or length(trim(coalesce(current_cutting_stage.external_fabric_source, ''))) > 0
    );
  if has_saved_fabric then
    resolved_fabric_name := coalesce(
      nullif(trim(current_cutting_stage.fabric), ''),
      nullif(trim(current_cutting_stage.external_fabric_source), ''),
      (select fabric.name
       from public.factory_fabrics as fabric
       where fabric.id = current_cutting_stage.fabric_id),
      'قماش مسجل'
    );
  else
    if length(trim(coalesce(requested_fabric, ''))) = 0
       or requested_bolt_count is null or requested_bolt_count < 0
       or requested_fabric_quantity is null or requested_fabric_quantity <= 0 then
      raise exception 'A valid fabric selection and positive fabric quantity are required because this cutting story has no saved fabric.';
    end if;
    if requested_fabric_id is null
       and coalesce(nullif(trim(requested_external_fabric_unit), ''), '') not in ('متر', 'توب') then
      raise exception 'Choose متر or توب for the external fabric quantity.';
    end if;
    if requested_fabric_id is null
       and ((requested_external_fabric_unit = 'توب'
             and (requested_fabric_quantity <> trunc(requested_fabric_quantity)
               or requested_bolt_count::numeric <> requested_fabric_quantity))
         or (requested_external_fabric_unit = 'متر' and requested_bolt_count <> 0)) then
      raise exception 'External cutting quantity and its selected unit do not match.';
    end if;
    if requested_fabric_id is not null then
      select unit into resolved_fabric_unit
      from public.factory_fabrics where id = requested_fabric_id
      for update;
      if not found or resolved_fabric_unit not in ('متر', 'توب')
         or (resolved_fabric_unit = 'توب'
             and (requested_fabric_quantity <> trunc(requested_fabric_quantity)
               or requested_bolt_count::numeric <> requested_fabric_quantity))
         or (resolved_fabric_unit = 'متر' and requested_bolt_count <> 0) then
        raise exception 'The cutting quantity must match the stock item measurement unit.';
      end if;
    end if;
  end if;

  select breakdown.normalized_sizes, breakdown.normalized_colors,
         breakdown.total_pieces, breakdown.total_plys
    into normalized_sizes, normalized_colors, cut_total, total_plys
  from public.calculate_factory_cutting_breakdown(requested_size_data, requested_color_ply_data) as breakdown;

  if not has_saved_fabric then
    resolved_fabric_name := public.reconcile_factory_fabric_usage(
      requested_order_id, requested_fabric_id, requested_fabric_quantity, requested_fabric
    );
    current_cutting_stage.fabric_id := requested_fabric_id;
    current_cutting_stage.fabric_quantity := requested_fabric_quantity;
    current_cutting_stage.bolt_count := requested_bolt_count;
    current_cutting_stage.external_fabric_source := case
      when requested_fabric_id is null then resolved_fabric_name
      else ''
    end;
    current_cutting_stage.external_fabric_unit := case
      when requested_fabric_id is null then coalesce(nullif(trim(requested_external_fabric_unit), ''), 'متر')
      else ''
    end;
  end if;

  update public.orders
  set sizes = normalized_sizes::text,
      colors = normalized_colors,
      original_total_pieces = case
        when original_total_pieces = 0 then cut_total
        else original_total_pieces
      end,
      color_names = coalesce((
        select jsonb_object_agg(upper(trim(color_entry ->> 'color')), trim(color_entry ->> 'name'))
        from jsonb_array_elements(requested_color_ply_data -> 'colors') as color_entry
        where length(trim(coalesce(color_entry ->> 'name', ''))) > 0
      ), '{}'::jsonb),
      model_image_url = coalesce(nullif(trim(requested_model_image_url), ''), model_image_url),
      total_pieces = cut_total,
      status = 'تم القص'
  where id = requested_order_id;

  update public.production_stages
  set target_quantity = cut_total,
      completed_quantity = cut_total,
      fabric = resolved_fabric_name,
      fabric_id = current_cutting_stage.fabric_id,
      external_fabric_source = current_cutting_stage.external_fabric_source,
      external_fabric_unit = current_cutting_stage.external_fabric_unit,
      fabric_quantity = current_cutting_stage.fabric_quantity,
      bolt_count = current_cutting_stage.bolt_count,
      layer_count = total_plys,
      color_ply_data = requested_color_ply_data,
      technical_notes = coalesce(nullif(trim(requested_technical_notes), ''), current_cutting_stage.technical_notes),
      cutter_name = coalesce(nullif(left(trim(coalesce(requested_cutter_name, '')), 120), ''), current_cutting_stage.cutter_name),
      status = 'مكتمل',
      updated_at = now()
  where order_id = requested_order_id
    and stage_name = 'cutting';

  return cut_total;
end;
$$;

drop function if exists public.admin_update_factory_cutting_details(
  uuid, jsonb, jsonb, text, integer, text, uuid, numeric, text, text
);

create or replace function public.admin_update_factory_cutting_details(
  requested_order_id uuid,
  requested_size_data jsonb,
  requested_color_ply_data jsonb,
  requested_fabric text,
  requested_fabric_details text,
  requested_bolt_count integer,
  requested_technical_notes text,
  requested_fabric_id uuid,
  requested_fabric_quantity numeric,
  requested_external_fabric_unit text,
  requested_cutter_name text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  current_cutting_stage public.production_stages%rowtype;
  normalized_sizes jsonb;
  normalized_colors text;
  calculated_total integer;
  total_plys integer;
  resolved_fabric_name text;
  resolved_fabric_unit text;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can edit cutting details.';
  end if;
  if requested_order_id is null
     or requested_size_data is null
     or coalesce(jsonb_typeof(requested_size_data), '') <> 'object'
     or coalesce(jsonb_typeof(requested_color_ply_data), '') <> 'object'
     or coalesce(jsonb_typeof(requested_color_ply_data -> 'sizes'), '') <> 'array'
     or coalesce(jsonb_typeof(requested_color_ply_data -> 'colors'), '') <> 'array'
     or requested_bolt_count is null or requested_bolt_count < 0
     or requested_fabric_quantity is null or requested_fabric_quantity <= 0
     or requested_fabric_quantity > 99999999999.999
     or length(trim(coalesce(requested_fabric_details, ''))) > 240
     or length(trim(coalesce(requested_cutter_name, ''))) > 120
     or length(trim(coalesce(requested_technical_notes, ''))) > 2000 then
    raise exception 'Enter valid cutting sizes, colors, fabric, quantity, and cutter details.';
  end if;
  if jsonb_array_length(requested_color_ply_data -> 'sizes') = 0
     or jsonb_array_length(requested_color_ply_data -> 'colors') = 0 then
    raise exception 'Select at least one size and one color before saving cutting details.';
  end if;

  if requested_fabric_id is null then
    if length(trim(coalesce(requested_fabric, ''))) not between 1 and 120
       or coalesce(nullif(trim(requested_external_fabric_unit), ''), '') not in ('متر', 'توب')
       or (requested_external_fabric_unit = 'توب'
           and (requested_fabric_quantity <> trunc(requested_fabric_quantity)
             or requested_bolt_count::numeric <> requested_fabric_quantity))
       or (requested_external_fabric_unit = 'متر' and requested_bolt_count <> 0) then
      raise exception 'External fabric quantity and its measurement unit do not match.';
    end if;
  else
    select unit into resolved_fabric_unit
    from public.factory_fabrics
    where id = requested_fabric_id
    for update;
    if not found
       or resolved_fabric_unit not in ('متر', 'توب')
       or (resolved_fabric_unit = 'توب'
           and (requested_fabric_quantity <> trunc(requested_fabric_quantity)
             or requested_bolt_count::numeric <> requested_fabric_quantity))
       or (resolved_fabric_unit = 'متر' and requested_bolt_count <> 0) then
      raise exception 'The selected fabric quantity does not match its stock unit.';
    end if;
  end if;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found
     or current_order.archived_at is not null
     or current_order.status = 'تم التسليم' then
    raise exception 'Delivered or archived orders cannot have cutting quantities changed.';
  end if;

  select *
    into current_cutting_stage
  from public.production_stages
  where order_id = requested_order_id
    and stage_name = 'cutting'
  for update;
  if not found then
    raise exception 'The cutting stage for this order does not exist.';
  end if;

  select breakdown.normalized_sizes, breakdown.normalized_colors,
         breakdown.total_pieces, breakdown.total_plys
    into normalized_sizes, normalized_colors, calculated_total, total_plys
  from public.calculate_factory_cutting_breakdown(requested_size_data, requested_color_ply_data) as breakdown;
  if calculated_total < greatest(
    current_order.delivered_pieces,
    coalesce((
      select max(stage.completed_quantity)
      from public.production_stages as stage
      where stage.order_id = requested_order_id
        and stage.stage_name <> 'delivery'
    ), 0)
  ) then
    raise exception 'The edited cutting quantity cannot be lower than quantities already completed or delivered.';
  end if;

  resolved_fabric_name := public.reconcile_factory_fabric_usage(
    requested_order_id, requested_fabric_id, requested_fabric_quantity, requested_fabric
  );

  update public.orders
  set colors = coalesce(normalized_colors, ''),
      color_names = coalesce((
        select jsonb_object_agg(upper(trim(color_entry ->> 'color')), trim(color_entry ->> 'name'))
        from jsonb_array_elements(requested_color_ply_data -> 'colors') as color_entry
        where length(trim(coalesce(color_entry ->> 'name', ''))) > 0
      ), '{}'::jsonb),
      sizes = normalized_sizes::text,
      original_total_pieces = case when original_total_pieces = 0 then calculated_total else original_total_pieces end,
      total_pieces = calculated_total
  where id = requested_order_id;

  update public.production_stages
  set target_quantity = calculated_total
  where order_id = requested_order_id;

  update public.production_stages
  set completed_quantity = case
        when current_cutting_stage.status in ('مكتمل', 'تم القص') then calculated_total
        else least(completed_quantity, calculated_total)
      end,
      fabric = resolved_fabric_name,
      fabric_details = trim(coalesce(requested_fabric_details, '')),
      fabric_id = requested_fabric_id,
      external_fabric_source = case when requested_fabric_id is null then trim(requested_fabric) else '' end,
      external_fabric_unit = case when requested_fabric_id is null then trim(requested_external_fabric_unit) else '' end,
      fabric_quantity = requested_fabric_quantity,
      bolt_count = requested_bolt_count,
      layer_count = total_plys,
      color_ply_data = requested_color_ply_data,
      technical_notes = coalesce(nullif(trim(requested_technical_notes), ''), current_cutting_stage.technical_notes),
      cutter_name = coalesce(nullif(left(trim(coalesce(requested_cutter_name, '')), 120), ''), current_cutting_stage.cutter_name),
      updated_at = now()
  where order_id = requested_order_id
    and stage_name = 'cutting';

  return calculated_total;
end;
$$;

create or replace function public.delete_factory_order(requested_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  fabric_reversal record;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can delete factory orders.';
  end if;
  if requested_order_id is null then
    raise exception 'A valid factory order is required.';
  end if;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found then
    raise exception 'Factory order not found.';
  end if;
  if current_order.archived_at is not null then
    raise exception 'Orders in a settled financial period cannot be deleted.';
  end if;

  for fabric_reversal in
    select movement.fabric_id,
           sum(case
             when movement.transaction_type in ('withdrawal', 'adjustment_out') then movement.quantity
             when movement.transaction_type in ('receipt', 'return', 'adjustment_in') then -movement.quantity
             else 0
           end) as quantity_delta
    from public.factory_fabric_transactions as movement
    where movement.order_id = requested_order_id
    group by movement.fabric_id
  loop
    if fabric_reversal.quantity_delta <> 0 then
      update public.factory_fabrics
      set quantity_available = quantity_available + fabric_reversal.quantity_delta,
          updated_at = now()
      where id = fabric_reversal.fabric_id
        and quantity_available + fabric_reversal.quantity_delta >= 0;
      if not found then
        raise exception 'The fabric used by this order has since been consumed; reconcile fabric stock before deleting the order.';
      end if;
    end if;
  end loop;

  delete from public.factory_fabric_transactions
  where order_id = requested_order_id;
  delete from public.factory_cash_transactions
  where order_id = requested_order_id;
  delete from public.factory_deliveries
  where order_id = requested_order_id;
  delete from public.orders
  where id = requested_order_id;
end;
$$;

create or replace function public.delete_factory_client(requested_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_client public.factory_clients%rowtype;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can delete factory client profiles.';
  end if;
  if requested_client_id is null then
    raise exception 'A valid factory client is required.';
  end if;

  select *
    into target_client
  from public.factory_clients
  where id = requested_client_id
  for update;
  if not found then
    raise exception 'Factory client not found.';
  end if;
  if target_client.user_id is not null
     and exists (
       select 1
       from public.users
       where id = target_client.user_id
     ) then
    raise exception 'Delete the linked login account first, then delete the client profile.';
  end if;
  if exists (
    select 1 from public.orders
    where customer_id = requested_client_id
       or (target_client.user_id is not null and client_id = target_client.user_id)
  ) or exists (
    select 1 from public.factory_deliveries
    where customer_id = requested_client_id
  ) or exists (
    select 1 from public.factory_cash_transactions
    where customer_id = requested_client_id
  ) or exists (
    select 1 from public.factory_fabrics
    where customer_id = requested_client_id
  ) or exists (
    select 1
    from public.factory_records
    where payload ->> 'customerId' = requested_client_id::text
       or payload ->> 'customer_id' = requested_client_id::text
       or (
         target_client.user_id is not null
         and owner_id = target_client.user_id
         and collection in ('payments', 'settlements')
       )
  ) then
    raise exception 'Client has linked production, financial, or inventory history; preserve it by keeping this profile.';
  end if;

  delete from public.factory_clients
  where id = requested_client_id;
  if not found then
    raise exception 'Factory client profile was not deleted.';
  end if;
end;
$$;

create or replace function public.save_factory_payment(
  requested_record_id uuid,
  requested_customer_id uuid,
  requested_amount numeric,
  requested_date date,
  requested_method text,
  requested_reference text,
  requested_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_client public.factory_clients%rowtype;
  saved_record_id uuid := coalesce(requested_record_id, gen_random_uuid());
  existing_record public.factory_records%rowtype;
  payment_payload jsonb;
  normalized_amount numeric(14, 2);
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can record factory payments.';
  end if;
  if requested_customer_id is null
     or requested_amount is null
     or requested_amount <= 0
     or requested_date is null then
    raise exception 'A valid customer, positive amount, and payment date are required.';
  end if;
  normalized_amount := round(requested_amount, 2);
  if normalized_amount <= 0 then
    raise exception 'The payment amount must be at least one piastre.';
  end if;

  select *
    into matched_client
  from public.factory_clients
  where id = requested_customer_id
  for update;
  if not found then
    raise exception 'The selected factory customer does not exist.';
  end if;

  payment_payload := jsonb_build_object(
    'customerId', matched_client.id,
    'clientId', matched_client.user_id,
    'clientName', matched_client.name,
    'amount', normalized_amount,
    'date', requested_date,
    'method', coalesce(nullif(trim(requested_method), ''), 'غير محدد'),
    'reference', coalesce(trim(requested_reference), ''),
    'notes', coalesce(trim(requested_notes), '')
  );

  if requested_record_id is null then
    insert into public.factory_records (id, collection, owner_id, payload, created_at, updated_at)
    values (saved_record_id, 'payments', matched_client.user_id, payment_payload, clock_timestamp(), clock_timestamp());
  else
    select *
      into existing_record
    from public.factory_records
    where id = requested_record_id
      and collection = 'payments'
    for update;
    if not found or existing_record.payload ->> 'customerId' <> matched_client.id::text then
      raise exception 'The selected payment does not belong to this customer.';
    end if;
    if matched_client.account_period_started_at is not null
       and existing_record.created_at < matched_client.account_period_started_at then
      raise exception 'Payments in a settled period are read-only.';
    end if;

    update public.factory_records
    set owner_id = matched_client.user_id,
        payload = payment_payload,
        updated_at = now()
    where id = requested_record_id;
  end if;

  return saved_record_id;
end;
$$;

create or replace function public.save_factory_client_account_adjustment(
  requested_customer_id uuid,
  requested_amount numeric,
  requested_reason text,
  requested_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_client public.factory_clients%rowtype;
  saved_record_id uuid := gen_random_uuid();
  normalized_amount numeric(14, 2);
  normalized_reason text := trim(coalesce(requested_reason, ''));
  normalized_notes text := trim(coalesce(requested_notes, ''));
  adjustment_time timestamptz := clock_timestamp();
  opening_balance numeric(14, 2) := 0;
  delivered_total numeric(14, 2) := 0;
  pending_total numeric(14, 2) := 0;
  client_expenses_total numeric(14, 2) := 0;
  order_paid_total numeric(14, 2) := 0;
  payments_total numeric(14, 2) := 0;
  existing_adjustments_total numeric(14, 2) := 0;
  current_balance numeric(14, 2);
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can adjust factory client accounts.';
  end if;
  if requested_customer_id is null
     or requested_amount is null
     or requested_amount <= 0
     or length(normalized_reason) = 0
     or length(normalized_reason) > 160
     or length(normalized_notes) > 500 then
    raise exception 'A customer, positive amount, reason, and valid notes are required.';
  end if;
  normalized_amount := round(requested_amount, 2);
  if normalized_amount <= 0 then
    raise exception 'The adjustment amount must be at least one piastre.';
  end if;

  select *
    into matched_client
  from public.factory_clients
  where id = requested_customer_id
  for update;
  if not found then
    raise exception 'The selected factory customer does not exist.';
  end if;
  if matched_client.account_period_started_at is not null
     and adjustment_time < matched_client.account_period_started_at then
    raise exception 'The selected account period is already settled.';
  end if;

  select round(coalesce((payload ->> 'balance')::numeric, 0), 2)
    into opening_balance
  from public.factory_records
  where collection = 'settlements'
    and payload ->> 'customerId' = matched_client.id::text
  order by created_at desc
  limit 1;
  opening_balance := coalesce(opening_balance, 0);

  select round(coalesce(sum(total_amount), 0), 2),
         round(coalesce(sum(case
           when status in ('تم التسليم', 'تم التسليم بالكامل', 'تم التسليم والإغلاق') then 0
           else expected_total_amount
         end), 0), 2),
         round(coalesce(sum(paid_amount), 0), 2)
    into delivered_total, pending_total, order_paid_total
  from public.orders
  where customer_id = matched_client.id
    and archived_at is null;

  select round(coalesce(sum(amount), 0), 2)
    into client_expenses_total
  from public.factory_cash_transactions
  where customer_id = matched_client.id
    and direction = 'expense'
    and (
      matched_client.account_period_started_at is null
      or occurred_at >= matched_client.account_period_started_at
    );

  select coalesce(sum(round((payload ->> 'amount')::numeric, 2)), 0)
    into payments_total
  from public.factory_records
  where collection = 'payments'
    and payload ->> 'customerId' = matched_client.id::text
    and (
      matched_client.account_period_started_at is null
      or created_at >= matched_client.account_period_started_at
    );

  select coalesce(sum(round((payload ->> 'amount')::numeric, 2)), 0)
    into existing_adjustments_total
  from public.factory_records
  where collection = 'account_adjustments'
    and payload ->> 'customerId' = matched_client.id::text
    and (
      matched_client.account_period_started_at is null
      or created_at >= matched_client.account_period_started_at
    );

  current_balance := round(
    opening_balance + delivered_total + pending_total + client_expenses_total
      - order_paid_total - payments_total - existing_adjustments_total,
    2
  );
  if current_balance <= 0 or normalized_amount > current_balance then
    raise exception 'The adjustment cannot exceed the outstanding customer balance.';
  end if;

  insert into public.factory_records (id, collection, owner_id, payload, created_at, updated_at)
  values (
    saved_record_id,
    'account_adjustments',
    matched_client.user_id,
    jsonb_build_object(
      'customerId', matched_client.id,
      'clientName', matched_client.name,
      'amount', normalized_amount,
      'reason', normalized_reason,
      'notes', normalized_notes,
      'date', adjustment_time,
      'category', 'خصم مسموح به'
    ),
    adjustment_time,
    adjustment_time
  );

  return saved_record_id;
end;
$$;

create or replace function public.settle_factory_client_account(
  requested_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_client public.factory_clients%rowtype;
  opening_balance numeric(14, 2) := 0;
  delivered_total numeric(14, 2) := 0;
  pending_total numeric(14, 2) := 0;
  client_expenses_total numeric(14, 2) := 0;
  order_paid_total numeric(14, 2) := 0;
  payments_total numeric(14, 2) := 0;
  account_adjustments_total numeric(14, 2) := 0;
  closing_balance numeric(14, 2);
  settlement_time timestamptz;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can settle factory client accounts.';
  end if;
  if requested_customer_id is null then
    raise exception 'A customer is required to settle an account.';
  end if;

  select *
    into matched_client
  from public.factory_clients
  where id = requested_customer_id
  for update;
  if not found then
    raise exception 'The selected factory customer does not exist.';
  end if;
  settlement_time := clock_timestamp();

  select round(coalesce((payload ->> 'balance')::numeric, 0), 2)
    into opening_balance
  from public.factory_records
  where collection = 'settlements'
    and payload ->> 'customerId' = matched_client.id::text
  order by created_at desc
  limit 1;
  opening_balance := coalesce(opening_balance, 0);

  select round(coalesce(sum(total_amount), 0), 2),
         round(coalesce(sum(case
           when status in ('تم التسليم', 'تم التسليم بالكامل', 'تم التسليم والإغلاق') then 0
           else expected_total_amount
         end), 0), 2),
         round(coalesce(sum(paid_amount), 0), 2)
    into delivered_total, pending_total, order_paid_total
  from public.orders
  where customer_id = matched_client.id
    and archived_at is null;

  select round(coalesce(sum(amount), 0), 2)
    into client_expenses_total
  from public.factory_cash_transactions
  where customer_id = matched_client.id
    and direction = 'expense'
    and (
      matched_client.account_period_started_at is null
      or occurred_at >= matched_client.account_period_started_at
    );

  select coalesce(sum(round((payload ->> 'amount')::numeric, 2)), 0)
    into payments_total
  from public.factory_records
  where collection = 'payments'
    and payload ->> 'customerId' = matched_client.id::text
    and (
      matched_client.account_period_started_at is null
      or created_at >= matched_client.account_period_started_at
    );

  select coalesce(sum(round((payload ->> 'amount')::numeric, 2)), 0)
    into account_adjustments_total
  from public.factory_records
  where collection = 'account_adjustments'
    and payload ->> 'customerId' = matched_client.id::text
    and (
      matched_client.account_period_started_at is null
      or created_at >= matched_client.account_period_started_at
    );

  closing_balance := round(
    opening_balance + delivered_total + pending_total + client_expenses_total - order_paid_total - payments_total - account_adjustments_total,
    2
  );

  update public.orders
  set archived_at = settlement_time
  where customer_id = matched_client.id
    and archived_at is null;

  insert into public.factory_records (collection, owner_id, payload, created_at, updated_at)
  values (
    'settlements',
    matched_client.user_id,
    jsonb_build_object(
      'customerId', matched_client.id,
      'clientName', matched_client.name,
      'openingBalance', opening_balance,
      'deliveredTotal', delivered_total,
      'pendingTotal', pending_total,
      'clientExpensesTotal', client_expenses_total,
      'orderPaidTotal', order_paid_total,
      'paymentsTotal', payments_total,
      'accountAdjustmentsTotal', account_adjustments_total,
      'balance', closing_balance,
      'date', settlement_time
    ),
    settlement_time,
    settlement_time
  );

  update public.factory_clients
  set account_period_started_at = settlement_time,
      updated_at = now()
  where id = matched_client.id;

  return jsonb_build_object(
    'balance', closing_balance,
    'settledAt', settlement_time
  );
end;
$$;

create or replace function public.ensure_factory_workforce_profile(requested_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_account public.users%rowtype;
  existing_profile public.factory_records%rowtype;
  profile_payload jsonb;
  profile_worker_id uuid;
begin
  select *
    into staff_account
  from public.users
  where id = requested_user_id
    and role in ('worker', 'cutting', 'sewing')
    and status in ('active', 'suspended');
  if not found then
    return;
  end if;
  if auth.uid() is not null and not public.is_active_factory_admin() then
    raise exception 'Only active admins can synchronize workforce profiles.';
  end if;

  profile_worker_id := staff_account.id;
  select *
    into existing_profile
  from public.factory_records
  where collection = 'workforce_profiles'
    and (
      payload ->> 'linkedUserId' = staff_account.id::text
      or (
        payload ->> 'workerId' = staff_account.id::text
        and coalesce(nullif(payload ->> 'linkedUserId', ''), staff_account.id::text) = staff_account.id::text
      )
    )
  order by coalesce(payload ->> 'linkedUserId' = staff_account.id::text, false) desc, created_at
  limit 1
  for update;
  if not found and exists (
    select 1
    from public.factory_records
    where collection = 'workforce_profiles'
      and payload ->> 'workerId' = staff_account.id::text
  ) then
    profile_worker_id := gen_random_uuid();
  end if;

  profile_payload := jsonb_build_object(
    'workerId', coalesce(nullif(existing_profile.payload ->> 'workerId', ''), profile_worker_id::text),
    'linkedUserId', staff_account.id,
    'employeeName', staff_account.name,
    'username', staff_account.username,
    'phone', coalesce(staff_account.phone, ''),
    'roleKey', staff_account.role,
    'jobTitle', coalesce(nullif(existing_profile.payload ->> 'jobTitle', ''), staff_account.job_title, 'عامل إنتاج')
  );

  if existing_profile.id is null then
    insert into public.factory_records (collection, owner_id, payload, created_at, updated_at)
    values ('workforce_profiles', staff_account.id, profile_payload, now(), now());
  else
    update public.factory_records
    set owner_id = staff_account.id,
        payload = existing_profile.payload || profile_payload,
        updated_at = now()
    where id = existing_profile.id;
  end if;
end;
$$;

create or replace function public.sync_factory_workforce_profile_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_factory_workforce_profile(new.id);
  return new;
end;
$$;

drop trigger if exists sync_factory_workforce_profile on public.users;
create trigger sync_factory_workforce_profile
  after insert or update of name, username, phone, role, status, job_title
  on public.users
  for each row
  execute function public.sync_factory_workforce_profile_trigger();

do $$
declare
  staff_account record;
begin
  for staff_account in
    select id
    from public.users
    where role in ('worker', 'cutting', 'sewing')
      and status in ('active', 'suspended')
  loop
    perform public.ensure_factory_workforce_profile(staff_account.id);
  end loop;
end;
$$;

alter table public.orders enable row level security;
alter table public.production_stages enable row level security;
alter table public.factory_records enable row level security;
alter table public.factory_deliveries enable row level security;
alter table public.factory_fabrics enable row level security;
alter table public.factory_fabric_transactions enable row level security;

drop policy if exists "Factory roles read relevant orders" on public.orders;
create policy "Factory roles read relevant orders"
  on public.orders for select to authenticated
  using (
    public.has_active_factory_role(array['admin', 'cutting', 'sewing'])
    or (
      public.has_active_factory_role(array['client'])
      and (
        client_id = auth.uid()
        or public.owns_factory_client_profile(customer_id)
      )
    )
  );

drop policy if exists "Admins manage orders" on public.orders;
create policy "Admins manage orders"
  on public.orders for all to authenticated
  using (public.is_active_factory_admin())
  with check (public.is_active_factory_admin());

drop policy if exists "Users read relevant production stages" on public.production_stages;
create policy "Users read relevant production stages"
  on public.production_stages for select to authenticated
  using (
    public.is_active_factory_admin()
    or (stage_name = 'cutting' and public.has_active_factory_role(array['cutting']))
    or (
      stage_name = 'cutting'
      and public.has_active_factory_role(array['sewing'])
      and exists (
        select 1
        from public.orders as sewing_order
        where sewing_order.id = production_stages.order_id
          and 'sewing' = any(sewing_order.work_stages)
      )
    )
    or (stage_name = 'sewing' and public.has_active_factory_role(array['sewing']))
    or exists (
      select 1
      from public.orders
      where orders.id = production_stages.order_id
        and (
          orders.client_id = auth.uid()
          or public.owns_factory_client_profile(orders.customer_id)
        )
        and public.has_active_factory_role(array['client'])
    )
    or (worker_id = auth.uid() and public.has_active_factory_role(array['worker']))
  );

drop policy if exists "Supervisors update their production stages" on public.production_stages;
drop policy if exists "Admins and cutters update production stages" on public.production_stages;
create policy "Admins and cutters update production stages"
  on public.production_stages for update to authenticated
  using (
    (
      public.is_active_factory_admin()
      and exists (
        select 1 from public.orders
        where orders.id = production_stages.order_id
          and orders.archived_at is null
          and orders.status not in ('تم التسليم', 'تم التسليم بالكامل', 'تم التسليم والإغلاق')
      )
    )
    or (
      stage_name = 'cutting'
      and public.has_active_factory_role(array['cutting'])
      and exists (
        select 1 from public.orders
        where orders.id = production_stages.order_id
          and orders.archived_at is null
          and orders.status not in ('تم التسليم', 'تم التسليم بالكامل', 'تم التسليم والإغلاق')
      )
    )
  )
  with check (
    (
      public.is_active_factory_admin()
      and exists (
        select 1 from public.orders
        where orders.id = production_stages.order_id
          and orders.archived_at is null
          and orders.status not in ('تم التسليم', 'تم التسليم بالكامل', 'تم التسليم والإغلاق')
      )
    )
    or (
      stage_name = 'cutting'
      and public.has_active_factory_role(array['cutting'])
      and exists (
        select 1 from public.orders
        where orders.id = production_stages.order_id
          and orders.archived_at is null
          and orders.status not in ('تم التسليم', 'تم التسليم بالكامل', 'تم التسليم والإغلاق')
      )
    )
  );

drop policy if exists "Admins manage factory records" on public.factory_records;
create policy "Admins manage factory records"
  on public.factory_records for all to authenticated
  using (public.is_active_factory_admin())
  with check (public.is_active_factory_admin());

drop policy if exists "Users read their own factory records" on public.factory_records;
create policy "Users read their own factory records"
  on public.factory_records for select to authenticated
  using (
    owner_id = auth.uid()
    and (
      (collection = 'payments' and public.has_active_factory_role(array['client']))
      or (collection = 'settlements' and public.has_active_factory_role(array['client']))
      or (collection = 'leaves' and public.has_active_factory_role(array['worker', 'cutting', 'sewing']))
      or (collection = 'tasks' and public.has_active_factory_role(array['worker']))
      or (collection in ('attendance', 'advances', 'payroll', 'worker_expenses') and public.has_active_factory_role(array['cutting', 'sewing', 'worker']))
      or (collection = 'account_adjustments' and public.has_active_factory_role(array['client']))
      or (collection in ('workforce_profiles', 'workforce_attendance', 'workforce_violations', 'workforce_settlements') and public.has_active_factory_role(array['worker', 'cutting', 'sewing']))
    )
  );

drop policy if exists "Factory staff read workforce settings" on public.factory_records;
create policy "Factory staff read workforce settings"
  on public.factory_records for select to authenticated
  using (
    collection = 'workforce_settings'
    and public.has_active_factory_role(array['worker', 'cutting', 'sewing'])
  );

drop policy if exists "Users read their own factory deliveries" on public.factory_deliveries;
create policy "Users read their own factory deliveries"
  on public.factory_deliveries for select to authenticated
  using (
    public.is_active_factory_admin()
    or exists (
      select 1
      from public.orders
      where orders.id = factory_deliveries.order_id
        and (
          orders.client_id = auth.uid()
          or public.owns_factory_client_profile(orders.customer_id)
        )
        and public.has_active_factory_role(array['client'])
    )
  );

drop policy if exists "Factory staff read fabric stock" on public.factory_fabrics;
create policy "Factory staff read fabric stock"
  on public.factory_fabrics for select to authenticated
  using (
    public.is_active_factory_admin()
    or (
      stock_scope = 'incoming'
      and public.has_active_factory_role(array['cutting'])
    )
  );

drop policy if exists "Admins read fabric transactions" on public.factory_fabric_transactions;
create policy "Admins read fabric transactions"
  on public.factory_fabric_transactions for select to authenticated
  using (public.is_active_factory_admin());

drop policy if exists "Cutting supervisors read incoming fabric transactions" on public.factory_fabric_transactions;
create policy "Cutting supervisors read incoming fabric transactions"
  on public.factory_fabric_transactions for select to authenticated
  using (
    public.has_active_factory_role(array['cutting'])
    and exists (
      select 1 from public.factory_fabrics
      where factory_fabrics.id = factory_fabric_transactions.fabric_id
        and factory_fabrics.stock_scope = 'incoming'
    )
  );

drop policy if exists "Admins read authentication events" on public.factory_auth_events;
create policy "Admins read authentication events"
  on public.factory_auth_events for select to authenticated
  using (public.is_active_factory_admin());

drop policy if exists "Factory roles read safe live signals" on public.factory_live_signals;
create policy "Factory roles read safe live signals"
  on public.factory_live_signals for select to authenticated
  using (
    public.has_active_factory_role(array['admin', 'cutting', 'sewing'])
    or (
      client_id = auth.uid()
      and public.has_active_factory_role(array['client'])
    )
    or (
      worker_id = auth.uid()
      and public.has_active_factory_role(array['worker'])
    )
  );

revoke all on public.orders, public.production_stages, public.factory_records, public.factory_deliveries,
  public.factory_fabrics, public.factory_fabric_transactions, public.factory_live_signals,
  public.factory_auth_events from public, anon, authenticated;
alter table public.factory_clients enable row level security;
alter table public.factory_client_model_requests enable row level security;
alter table public.factory_worker_production_submissions enable row level security;
alter table public.factory_finished_goods enable row level security;
drop policy if exists "Admins manage factory clients" on public.factory_clients;
create policy "Admins manage factory clients"
  on public.factory_clients for all to authenticated
  using (public.is_active_factory_admin())
  with check (public.is_active_factory_admin());
revoke all on public.factory_clients from public, anon, authenticated;
grant select on public.factory_clients to authenticated;
grant insert (name, brand_name, code_letter, client_number, phone, cash_phone, instagram, whatsapp, notes) on public.factory_clients to authenticated;
grant update (name, brand_name, code_letter, client_number, phone, cash_phone, instagram, whatsapp, notes, updated_at) on public.factory_clients to authenticated;
revoke all on public.factory_client_model_requests from public, anon, authenticated;
grant select on public.factory_client_model_requests to authenticated;
drop policy if exists "Admins and clients read client model requests" on public.factory_client_model_requests;
create policy "Admins and clients read client model requests"
  on public.factory_client_model_requests for select to authenticated
  using (
    public.is_active_factory_admin()
    or (
      public.has_active_factory_role(array['client'])
      and (
        user_id = auth.uid()
        or public.owns_factory_client_profile(client_id)
      )
    )
  );
drop policy if exists "Admins manage worker production submissions" on public.factory_worker_production_submissions;
create policy "Admins manage worker production submissions"
  on public.factory_worker_production_submissions for all to authenticated
  using (public.is_active_factory_admin())
  with check (public.is_active_factory_admin());
drop policy if exists "Workers read own production submissions" on public.factory_worker_production_submissions;
create policy "Workers read own production submissions"
  on public.factory_worker_production_submissions for select to authenticated
  using (worker_id = auth.uid() and public.has_active_factory_role(array['worker']));
drop policy if exists "Permitted workers submit own production" on public.factory_worker_production_submissions;
create policy "Permitted workers submit own production"
  on public.factory_worker_production_submissions for insert to authenticated
  with check (
    worker_id = auth.uid()
    and status = 'pending'
    and public.factory_production_colors_match_quantity(colors, quantity)
    and image_path is not null
    and image_path like ('worker-submissions/' || auth.uid()::text || '/%')
    and (
      parent_submission_id is null
      or exists (
        select 1 from public.factory_worker_production_submissions parent
        where parent.id = factory_worker_production_submissions.parent_submission_id
          and parent.worker_id = auth.uid()
      )
    )
    and exists (
      select 1 from public.users
      where id = auth.uid()
        and role = 'worker'
        and status = 'active'
        and can_submit_production
        and name = factory_worker_production_submissions.worker_name
        and job_title = factory_worker_production_submissions.job_title
    )
  );
drop policy if exists "Permitted workers update own pending production" on public.factory_worker_production_submissions;
create policy "Permitted workers update own pending production"
  on public.factory_worker_production_submissions for update to authenticated
  using (
    worker_id = auth.uid()
    and status = 'pending'
    and public.factory_production_colors_match_quantity(colors, quantity)
    and image_path is not null
    and image_path like ('worker-submissions/' || auth.uid()::text || '/%')
    and exists (
      select 1 from public.users
      where id = auth.uid()
        and role = 'worker'
        and status = 'active'
        and can_submit_production
        and name = factory_worker_production_submissions.worker_name
        and job_title = factory_worker_production_submissions.job_title
    )
  )
  with check (
    worker_id = auth.uid()
    and status = 'pending'
    and public.factory_production_colors_match_quantity(colors, quantity)
    and image_path is not null
    and image_path like ('worker-submissions/' || auth.uid()::text || '/%')
    and (
      parent_submission_id is null
      or exists (
        select 1 from public.factory_worker_production_submissions parent
        where parent.id = factory_worker_production_submissions.parent_submission_id
          and parent.worker_id = auth.uid()
      )
    )
    and exists (
      select 1 from public.users
      where id = auth.uid()
        and role = 'worker'
        and status = 'active'
        and can_submit_production
        and name = factory_worker_production_submissions.worker_name
        and job_title = factory_worker_production_submissions.job_title
    )
  );
revoke all on public.factory_worker_production_submissions from public, anon, authenticated;
grant select, insert, update, delete on public.factory_worker_production_submissions to authenticated;
drop policy if exists "Admins manage factory finished goods" on public.factory_finished_goods;
create policy "Admins manage factory finished goods"
  on public.factory_finished_goods for all to authenticated
  using (public.is_active_factory_admin())
  with check (public.is_active_factory_admin());
drop policy if exists "Clients read their own finished goods" on public.factory_finished_goods;
create policy "Clients read their own finished goods"
  on public.factory_finished_goods for select to authenticated
  using (
    public.has_active_factory_role(array['client'])
    and public.owns_factory_client_profile(customer_id)
  );
revoke all on public.factory_finished_goods from public, anon, authenticated;
grant select on public.factory_finished_goods to authenticated;
alter table public.factory_cash_transactions enable row level security;
revoke all on public.factory_cash_transactions from public, anon, authenticated;
drop policy if exists "Admins read factory cash transactions" on public.factory_cash_transactions;
create policy "Admins read factory cash transactions"
  on public.factory_cash_transactions for select to authenticated
  using (public.is_active_factory_admin());
grant select on public.factory_cash_transactions to authenticated;
alter table public.factory_order_expenses enable row level security;
revoke all on public.factory_order_expenses from public, anon, authenticated;
drop policy if exists "Admins read factory order expenses" on public.factory_order_expenses;
create policy "Admins read factory order expenses"
  on public.factory_order_expenses for select to authenticated
  using (public.is_active_factory_admin());
grant select on public.factory_order_expenses to authenticated;
grant select (id, client_id, customer_id, model_name, model_number, factory_model_code, client_model_code, production_type, work_stages, colors, color_names, color_size_distribution, sizes, original_total_pieces, total_pieces, delivered_pieces, archived_at, status, priority, created_at)
  on public.orders to authenticated;
grant select (sender_name) on public.orders to authenticated;
grant select (model_image_url, model_image_url_2) on public.orders to authenticated;
grant select on public.production_stages to authenticated;
grant select, insert, update on public.factory_records to authenticated;
grant select on public.factory_deliveries to authenticated;
grant select on public.factory_fabrics to authenticated;
grant select on public.factory_fabric_transactions to authenticated;
revoke all on public.factory_cutting_stories from public, anon, authenticated;
grant select on public.factory_cutting_stories to authenticated;
grant select on public.factory_live_signals to authenticated;
grant select on public.factory_auth_events to authenticated;
grant update (completed_quantity, status, updated_at) on public.production_stages to authenticated;
revoke all on function public.has_active_factory_role(text[]) from public, anon, authenticated;
create or replace function public.delete_factory_payment(requested_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can delete factory payments.';
  end if;
  if requested_record_id is null then
    raise exception 'A valid payment record is required.';
  end if;

  delete from public.factory_records
  where id = requested_record_id
    and collection = 'payments';
  if not found then
    raise exception 'Payment record not found.';
  end if;
end;
$$;

create or replace function public.delete_factory_cash_transaction(requested_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_customer_id uuid;
  transaction_order_id uuid;
  transaction_time timestamptz;
  period_start timestamptz;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can delete cash transactions.';
  end if;
  if requested_transaction_id is null then
    raise exception 'A valid cash transaction is required.';
  end if;

  select customer_id, order_id, occurred_at
    into transaction_customer_id, transaction_order_id, transaction_time
  from public.factory_cash_transactions
  where id = requested_transaction_id
  for update;
  if not found then
    raise exception 'Cash transaction not found.';
  end if;
  if transaction_order_id is not null then
    raise exception 'Order operating expenses must be changed from the order editor.';
  end if;
  if transaction_customer_id is not null then
    select account_period_started_at
      into period_start
    from public.factory_clients
    where id = transaction_customer_id;
    if period_start is not null and transaction_time < period_start then
      raise exception 'Cash transactions in a settled client period are immutable.';
    end if;
  end if;
  delete from public.factory_cash_transactions where id = requested_transaction_id;
end;
$$;

create or replace function public.delete_factory_fabric_transaction(requested_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  movement public.factory_fabric_transactions%rowtype;
  stock_item public.factory_fabrics%rowtype;
  stock_delta numeric(14, 3);
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can delete fabric transactions.';
  end if;
  if requested_transaction_id is null then
    raise exception 'A valid fabric transaction is required.';
  end if;

  select * into movement
  from public.factory_fabric_transactions
  where id = requested_transaction_id
  for update;
  if not found then
    raise exception 'Fabric transaction not found.';
  end if;
  if movement.order_id is not null then
    raise exception 'Fabric transactions linked to a cutting order cannot be deleted.';
  end if;

  select * into stock_item
  from public.factory_fabrics
  where id = movement.fabric_id
  for update;
  if not found then
    raise exception 'The related fabric stock item no longer exists.';
  end if;

  stock_delta := case
    when movement.transaction_type in ('receipt', 'return', 'adjustment_in') then -movement.quantity
    when movement.transaction_type in ('withdrawal', 'adjustment_out') then movement.quantity
    else null
  end;
  if stock_delta is null or stock_item.quantity_available + stock_delta < 0 then
    raise exception 'Deleting this transaction would make fabric stock invalid.';
  end if;

  update public.factory_fabrics
  set quantity_available = quantity_available + stock_delta,
      updated_at = now()
  where id = stock_item.id;
  delete from public.factory_fabric_transactions where id = movement.id;
end;
$$;

create or replace function public.update_factory_sewing_details(
  requested_order_id uuid,
  requested_target_quantity integer,
  requested_technical_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  current_stage public.production_stages%rowtype;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can update sewing details.';
  end if;
  if requested_order_id is null
     or requested_target_quantity is null
     or requested_target_quantity < 0
     or length(coalesce(requested_technical_notes, '')) > 2000 then
    raise exception 'A valid sewing order, non-negative target quantity, and notes up to 2000 characters are required.';
  end if;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found
     or current_order.archived_at is not null
     or current_order.status in ('تم التسليم', 'تم التسليم بالكامل', 'تم التسليم والإغلاق') then
    raise exception 'The active factory order was not found.';
  end if;

  select *
    into current_stage
  from public.production_stages
  where order_id = requested_order_id
    and stage_name = 'sewing'
  for update;
  if not found
     or current_stage.status not in ('متاح للخياطة', 'قيد الخياطة', 'قيد التنفيذ') then
    raise exception 'Only an available or active sewing stage can be edited.';
  end if;
  if requested_target_quantity < current_stage.completed_quantity then
    raise exception 'The sewing target quantity cannot be less than the completed quantity.';
  end if;

  update public.production_stages
  set target_quantity = requested_target_quantity,
      technical_notes = trim(coalesce(requested_technical_notes, '')),
      updated_at = now()
  where id = current_stage.id;
end;
$$;

create or replace function public.transition_factory_sewing_stage(
  requested_order_id uuid,
  requested_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  current_cutting_stage public.production_stages%rowtype;
  current_sewing_stage public.production_stages%rowtype;
  next_stage_name text;
begin
  if requested_order_id is null
     or requested_action is null
     or requested_action not in ('make_available', 'start', 'finish') then
    raise exception 'A valid order and sewing action are required.';
  end if;
  if requested_action = 'make_available'
     and not public.is_active_factory_admin() then
    raise exception 'Only active admins can make sewing orders available.';
  elsif requested_action = 'start'
     and not public.is_active_factory_admin()
     and not public.has_active_factory_role(array['sewing']) then
    raise exception 'Only active admins or sewing supervisors can start sewing.';
  elsif requested_action = 'finish'
     and not public.is_active_factory_admin()
     and not public.has_active_factory_role(array['sewing']) then
    raise exception 'Only active admins or sewing supervisors can finish sewing.';
  end if;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found
     or current_order.archived_at is not null
     or current_order.status in ('تم التسليم') then
    raise exception 'The active factory order was not found.';
  end if;
  if requested_action = 'make_available' and public.is_active_factory_admin() then
    if not coalesce('sewing' = any(current_order.work_stages), false) then
      update public.orders
      set work_stages = array_append(work_stages, 'sewing')
      where id = requested_order_id;
      current_order.work_stages := array_append(current_order.work_stages, 'sewing');
    end if;
    if not exists (
      select 1
      from public.production_stages
      where order_id = requested_order_id
        and stage_name = 'sewing'
    ) then
      insert into public.production_stages (order_id, stage_name, target_quantity, status)
      values (requested_order_id, 'sewing', current_order.total_pieces, 'معلق');
    end if;
  end if;
  if not coalesce('sewing' = any(current_order.work_stages), false) then
    raise exception 'This order does not include a sewing stage.';
  end if;

  select *
    into current_sewing_stage
  from public.production_stages
  where order_id = requested_order_id
    and stage_name = 'sewing'
  for update;
  if not found then
    raise exception 'The sewing stage for this order was not found.';
  end if;

  if requested_action = 'make_available' then
    select *
      into current_cutting_stage
    from public.production_stages
    where order_id = requested_order_id
      and stage_name in ('cutting', 'قص', 'تقطيع')
      and status in ('مكتمل', 'تم القص')
    for update;
    if not found then
      raise exception 'Finish cutting before making this order available for sewing.';
    end if;
    if current_sewing_stage.status in ('متاح للخياطة', 'قيد الخياطة', 'مكتمل')
       or current_order.status in ('تمت الخياطة', 'جاهز للتسليم', 'تم التسليم') then
      raise exception 'This order has already entered or completed sewing.';
    end if;

    update public.production_stages
    set status = 'متاح للخياطة',
        updated_at = now()
    where id = current_sewing_stage.id;
    update public.orders
    set status = 'في انتظار الخياطة'
    where id = requested_order_id;
    return;
  end if;

  if requested_action = 'start' then
    if current_sewing_stage.status <> 'متاح للخياطة' then
      raise exception 'Only an available sewing order can be started.';
    end if;
    update public.production_stages
    set status = 'قيد الخياطة',
        updated_at = now()
    where id = current_sewing_stage.id;
    update public.orders
    set status = 'جاري الخياطة'
    where id = requested_order_id;
    return;
  end if;

  if current_sewing_stage.status <> 'قيد الخياطة' then
    raise exception 'Only a sewing order in progress can be completed.';
  end if;

  select selected_stage.stage_name
    into next_stage_name
  from unnest(current_order.work_stages) with ordinality as selected_stage(stage_name, stage_position)
  where selected_stage.stage_name in ('finishing', 'ironing', 'printing', 'packaging', 'sorting')
    and exists (
      select 1
      from public.production_stages as extra_stage
      where extra_stage.order_id = requested_order_id
        and extra_stage.stage_name = selected_stage.stage_name
        and extra_stage.status <> 'مكتمل'
    )
  order by selected_stage.stage_position
  limit 1;

  update public.production_stages
  set status = 'مكتمل',
      completed_quantity = target_quantity,
      updated_at = now()
  where id = current_sewing_stage.id;

  if next_stage_name is not null then
    update public.production_stages
    set status = 'قيد التنفيذ',
        updated_at = now()
    where order_id = requested_order_id
      and stage_name = next_stage_name;
    if not found then
      raise exception 'The next production stage for this order was not found.';
    end if;
    update public.orders
    set status = case next_stage_name
      when 'finishing' then 'جاري التشطيب'
      when 'ironing' then 'جاري المكواة'
      when 'printing' then 'جاري الطباعة'
      when 'packaging' then 'جاري التكييس'
      when 'sorting' then 'جاري الفرز'
    end
    where id = requested_order_id;
  else
    update public.orders
    set status = 'جاهز للتسليم'
    where id = requested_order_id;
    update public.production_stages
    set status = 'جاهز للتسليم',
        updated_at = now()
    where order_id = requested_order_id
      and stage_name = 'delivery';
  end if;
end;
$$;

drop function if exists public.confirm_factory_worker_production(uuid, text, integer, jsonb, uuid, uuid);

create or replace function public.confirm_factory_worker_production(
  requested_submission_id uuid,
  requested_model_name text,
  requested_model_number text,
  requested_quantity integer,
  requested_colors jsonb,
  requested_customer_id uuid,
  requested_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_submission public.factory_worker_production_submissions%rowtype;
  linked_order_customer uuid;
  finished_goods_id uuid;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can confirm worker production.';
  end if;
  if length(trim(coalesce(requested_model_name, ''))) not between 1 and 160
     or length(coalesce(requested_model_number, '')) > 120
     or requested_quantity is null
     or requested_quantity < 1
     or not public.factory_production_colors_match_quantity(requested_colors, requested_quantity) then
    raise exception 'Enter valid production model, quantity, and colors.';
  end if;

  select *
    into current_submission
  from public.factory_worker_production_submissions
  where id = requested_submission_id
  for update;
  if not found or current_submission.status <> 'pending' then
    raise exception 'The worker production submission is not pending review.';
  end if;
  if not exists (
    select 1 from public.factory_clients where id = requested_customer_id
  ) then
    raise exception 'Choose a valid customer for the finished goods.';
  end if;

  if requested_order_id is not null then
    select customer_id
      into linked_order_customer
    from public.orders
    where id = requested_order_id;
    if not found or linked_order_customer is distinct from requested_customer_id then
      raise exception 'The selected order does not belong to the selected customer.';
    end if;
  end if;

  insert into public.factory_finished_goods (
    submission_id, order_id, customer_id, model_name, model_number, quantity,
    colors, image_path, worker_name, confirmed_by
  )
  values (
    current_submission.id, requested_order_id, requested_customer_id,
    trim(requested_model_name), coalesce(requested_model_number, ''), requested_quantity, requested_colors,
    current_submission.image_path, current_submission.worker_name, auth.uid()
  )
  returning id into finished_goods_id;

  update public.factory_worker_production_submissions
  set status = 'confirmed',
      model_name = trim(requested_model_name),
      model_number = coalesce(requested_model_number, ''),
      quantity = requested_quantity,
      colors = requested_colors,
      updated_at = now()
  where id = current_submission.id;
  return finished_goods_id;
end;
$$;

revoke all on function public.delete_factory_payment(uuid) from public, anon, authenticated;
grant execute on function public.delete_factory_payment(uuid) to authenticated;
revoke all on function public.delete_factory_cash_transaction(uuid) from public, anon, authenticated;
grant execute on function public.delete_factory_cash_transaction(uuid) to authenticated;
revoke all on function public.update_factory_cash_transaction(uuid, text, text, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.update_factory_cash_transaction(uuid, text, text, text, numeric, text, timestamptz) to authenticated;
revoke all on function public.delete_factory_fabric_transaction(uuid) from public, anon, authenticated;
grant execute on function public.delete_factory_fabric_transaction(uuid) to authenticated;
revoke all on function public.transition_factory_sewing_stage(uuid, text) from public, anon, authenticated;
grant execute on function public.transition_factory_sewing_stage(uuid, text) to authenticated;
revoke all on function public.confirm_factory_worker_production(uuid, text, text, integer, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_factory_worker_production(uuid, text, text, integer, jsonb, uuid, uuid) to authenticated;
revoke all on function public.is_valid_factory_production_colors(jsonb) from public, anon, authenticated;
grant execute on function public.is_valid_factory_production_colors(jsonb) to authenticated;
revoke all on function public.factory_production_colors_match_quantity(jsonb, integer) from public, anon, authenticated;
grant execute on function public.factory_production_colors_match_quantity(jsonb, integer) to authenticated;

grant execute on function public.has_active_factory_role(text[]) to authenticated;
revoke all on function public.owns_factory_client_profile(uuid) from public, anon, authenticated;
grant execute on function public.owns_factory_client_profile(uuid) to authenticated;
revoke all on function public.create_factory_order_stages() from public, anon, authenticated;
revoke all on function public.sync_factory_client_profile() from public, anon, authenticated;
revoke all on function public.read_factory_orders_admin() from public, anon, authenticated;
grant execute on function public.read_factory_orders_admin() to authenticated;
revoke all on function public.read_factory_order_expenses_admin() from public, anon, authenticated;
grant execute on function public.read_factory_order_expenses_admin() to authenticated;
revoke all on function public.admin_add_factory_order_expense(uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.admin_add_factory_order_expense(uuid, text, numeric, text) to authenticated;
revoke all on function public.read_factory_orders_client() from public, anon, authenticated;
grant execute on function public.read_factory_orders_client() to authenticated;
revoke all on function public.read_factory_client_cash_transactions() from public, anon, authenticated;
grant execute on function public.read_factory_client_cash_transactions() to authenticated;
revoke all on function public.read_factory_client_fabric_stock() from public, anon, authenticated;
grant execute on function public.read_factory_client_fabric_stock() to authenticated;
revoke all on function public.submit_factory_client_model_request(text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.submit_factory_client_model_request(text, text, integer, text, text) to authenticated;
revoke all on function public.read_factory_cutting_clients() from public, anon, authenticated;
grant execute on function public.read_factory_cutting_clients() to authenticated;
revoke all on function public.save_factory_order(uuid, uuid, text, text, integer, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text, jsonb, text, jsonb, text[], text, jsonb, numeric, text, text) from public, anon, authenticated;
grant execute on function public.save_factory_order(uuid, uuid, text, text, integer, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text, jsonb, text, jsonb, text[], text, jsonb, numeric, text, text) to authenticated;
revoke all on function public.admin_update_factory_order_stage_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_update_factory_order_stage_status(uuid, text) to authenticated;
revoke all on function public.record_factory_delivery(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.record_factory_delivery(uuid, integer, text) to authenticated;
revoke all on function public.complete_factory_handover(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.complete_factory_handover(uuid, integer, text) to authenticated;
revoke all on function public.admin_update_factory_delivery_quantity(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_update_factory_delivery_quantity(uuid, uuid, integer) to authenticated;
revoke all on function public.calculate_factory_cutting_breakdown(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.submit_factory_cutting(uuid, uuid, text, text, jsonb, jsonb, text, text, text, integer, text, uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_factory_cutting(uuid, uuid, text, text, jsonb, jsonb, text, text, text, integer, text, uuid, numeric, text, uuid) to authenticated;
revoke all on function public.admin_approve_factory_cutting_story(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_approve_factory_cutting_story(uuid, text) to authenticated;
revoke all on function public.admin_reject_factory_cutting_story(uuid) from public, anon, authenticated;
grant execute on function public.admin_reject_factory_cutting_story(uuid) to authenticated;
revoke all on function public.update_factory_cutting_progress(uuid, jsonb, jsonb, text, integer, text, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.update_factory_cutting_progress(uuid, jsonb, jsonb, text, integer, text, uuid, numeric, text) to authenticated;
revoke all on function public.admin_update_factory_cutting_details(uuid, jsonb, jsonb, text, text, integer, text, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_factory_cutting_details(uuid, jsonb, jsonb, text, text, integer, text, uuid, numeric, text, text) to authenticated;
revoke all on function public.update_factory_sewing_details(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.update_factory_sewing_details(uuid, integer, text) to authenticated;
revoke all on function public.save_factory_fabric(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_factory_fabric(uuid, text, text, text, text, text) to authenticated;
revoke all on function public.record_factory_fabric_receipt(uuid, numeric, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_factory_fabric_receipt(uuid, numeric, timestamptz, text) to authenticated;
revoke all on function public.record_factory_fabric_receipts(jsonb, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_factory_fabric_receipts(jsonb, timestamptz, text) to authenticated;
revoke all on function public.register_factory_incoming_fabric(uuid, text, text, text, numeric, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.register_factory_incoming_fabric(uuid, text, text, text, numeric, text, timestamptz, text) to authenticated;
revoke all on function public.register_factory_incoming_fabrics(uuid, jsonb, timestamptz, text) from public, anon, authenticated;
grant execute on function public.register_factory_incoming_fabrics(uuid, jsonb, timestamptz, text) to authenticated;
revoke all on function public.assign_factory_incoming_fabric(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_factory_incoming_fabric(uuid, uuid) to authenticated;
revoke all on function public.adjust_factory_fabric_stock(uuid, numeric, timestamptz, text) from public, anon, authenticated;
grant execute on function public.adjust_factory_fabric_stock(uuid, numeric, timestamptz, text) to authenticated;
revoke all on function public.record_factory_fabric_withdrawal(uuid, numeric, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_factory_fabric_withdrawal(uuid, numeric, timestamptz, text) to authenticated;
revoke all on function public.delete_factory_fabric(uuid) from public, anon, authenticated;
grant execute on function public.delete_factory_fabric(uuid) to authenticated;
revoke all on function public.reconcile_factory_fabric_usage(uuid, uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.guard_factory_financial_history() from public, anon, authenticated;
revoke all on function public.emit_factory_live_signal() from public, anon, authenticated;
revoke all on function public.emit_factory_client_live_signal() from public, anon, authenticated;
revoke all on function public.record_factory_auth_event(text) from public, anon, authenticated;
grant execute on function public.record_factory_auth_event(text) to authenticated;
revoke all on function public.mark_factory_cutting_ready(uuid) from public, anon, authenticated;
grant execute on function public.mark_factory_cutting_ready(uuid) to authenticated;
revoke all on function public.finish_factory_cutting(uuid, jsonb, jsonb, text, text, integer, text, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.finish_factory_cutting(uuid, jsonb, jsonb, text, text, integer, text, uuid, numeric, text, text) to authenticated;
revoke all on function public.delete_factory_order(uuid) from public, anon, authenticated;
grant execute on function public.delete_factory_order(uuid) to authenticated;
revoke all on function public.delete_factory_client(uuid) from public, anon, authenticated;
grant execute on function public.delete_factory_client(uuid) to authenticated;
revoke all on function public.save_factory_payment(uuid, uuid, numeric, date, text, text, text) from public, anon, authenticated;
grant execute on function public.save_factory_payment(uuid, uuid, numeric, date, text, text, text) to authenticated;
revoke all on function public.save_factory_client_account_adjustment(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.save_factory_client_account_adjustment(uuid, numeric, text, text) to authenticated;
revoke all on function public.settle_factory_client_account(uuid) from public, anon, authenticated;
grant execute on function public.settle_factory_client_account(uuid) to authenticated;
revoke all on function public.ensure_factory_workforce_profile(uuid) from public, anon, authenticated;
grant execute on function public.ensure_factory_workforce_profile(uuid) to authenticated;
revoke all on function public.sync_factory_workforce_profile_trigger() from public, anon, authenticated;
revoke all on function public.save_factory_cash_transaction(text, text, text, numeric, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.save_factory_cash_transaction(text, text, text, numeric, text, timestamptz, uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('factory-model-images', 'factory-model-images', true, 26214400, null)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Factory staff upload model images" on storage.objects;
create policy "Factory staff upload model images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'factory-model-images'
    and (
      public.has_active_factory_role(array['admin', 'cutting'])
      or (
        name like ('worker-submissions/' || auth.uid()::text || '/%')
        and exists (
          select 1 from public.users
          where id = auth.uid()
            and role = 'worker'
            and status = 'active'
            and can_submit_production
        )
      )
      or (
        name like ('client-submissions/' || auth.uid()::text || '/%')
        and public.has_active_factory_role(array['client'])
        and exists (
          select 1 from public.factory_clients
          where user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "Factory admins delete model images" on storage.objects;
drop policy if exists "Factory staff delete eligible model images" on storage.objects;
create policy "Factory staff delete eligible model images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'factory-model-images'
    and (
      public.has_active_factory_role(array['admin'])
      or (
        public.has_active_factory_role(array['worker'])
        and name like ('worker-submissions/' || auth.uid()::text || '/%')
        and exists (
          select 1 from public.users
          where id = auth.uid()
            and role = 'worker'
            and status = 'active'
            and can_submit_production
        )
        and not exists (
          select 1 from public.factory_worker_production_submissions
          where worker_id = auth.uid()
            and image_path = name
        )
      )
      or (
        public.has_active_factory_role(array['client'])
        and name like ('client-submissions/' || auth.uid()::text || '/%')
        and exists (
          select 1 from public.factory_clients
          where user_id = auth.uid()
        )
        and not exists (
          select 1 from public.factory_client_model_requests
          where user_id = auth.uid()
            and image_path = name
        )
      )
    )
  );

-- Create this Auth user with email auto-confirmed before running the schema:
--   email: mohamed01007033454@gmail.com
-- Set its password privately in the Supabase Dashboard; never store it here.
update public.users as account
set name = 'ZERO0',
    username = 'ZERO0',
    email = auth_user.email,
    role = 'admin',
    status = 'active',
    updated_at = now()
from auth.users as auth_user
where account.id = auth_user.id
  and lower(auth_user.email) in (
    'mohamed01007033454@gmail.com',
    'zero0@accounts.al-motamayez.invalid'
  );

insert into public.users (id, name, username, email, role, status)
select auth_user.id, 'ZERO0', 'ZERO0', lower(auth_user.email), 'admin', 'active'
from auth.users as auth_user
where lower(auth_user.email) = 'mohamed01007033454@gmail.com'
on conflict (id) do update
set name = excluded.name,
    username = excluded.username,
    email = excluded.email,
    role = excluded.role,
    status = excluded.status,
    updated_at = now();

do $$
declare
  table_name text;
  publication_covers_all boolean;
  publication_includes_public_schema boolean;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;

  select puballtables into publication_covers_all
  from pg_publication
  where pubname = 'supabase_realtime';
  select exists (
    select 1
    from pg_publication_namespace as publication_namespace
    join pg_publication as publication
      on publication.oid = publication_namespace.pnpubid
    where publication.pubname = 'supabase_realtime'
      and publication_namespace.pnnspid = 'public'::regnamespace
  ) into publication_includes_public_schema;

  if publication_covers_all or publication_includes_public_schema then
    raise warning 'supabase_realtime publishes all public tables; switch it to explicit tables if column-level financial privacy is required.';
  end if;

  if not publication_covers_all and not publication_includes_public_schema then
    foreach table_name in array array['orders', 'production_stages'] loop
      if exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime drop table public.%I', table_name);
      end if;
    end loop;
  end if;

  if not publication_covers_all and not publication_includes_public_schema then
    foreach table_name in array array[
      'factory_live_signals',
      'factory_auth_events',
      'factory_fabrics',
      'factory_fabric_transactions',
      'factory_cash_transactions',
      'users',
      'factory_clients',
      'factory_records',
      'factory_deliveries',
      'factory_worker_production_submissions',
      'factory_finished_goods',
      'factory_client_model_requests',
      'factory_cutting_stories'
    ] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

alter table public.orders replica identity full;
alter table public.production_stages replica identity full;
alter table public.factory_fabrics replica identity full;
alter table public.factory_fabric_transactions replica identity full;
alter table public.factory_auth_events replica identity full;
alter table public.users replica identity full;
alter table public.factory_cash_transactions replica identity full;
alter table public.factory_worker_production_submissions replica identity full;
alter table public.factory_finished_goods replica identity full;
alter table public.factory_client_model_requests replica identity full;
alter table public.factory_cutting_stories replica identity full;

notify pgrst, 'reload schema';
