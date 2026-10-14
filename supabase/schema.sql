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
  phone text not null default '',
  notes text not null default '',
  account_period_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.factory_clients
  add column if not exists account_period_started_at timestamptz;

create or replace function public.sync_factory_client_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'client' and new.status = 'active' then
    insert into public.factory_clients (user_id, name, phone)
    values (new.id, new.name, coalesce(new.phone, ''))
    on conflict (user_id) do update
      set name = excluded.name,
          phone = excluded.phone,
          updated_at = now();
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
revoke all on function public.create_pending_factory_user() from public, anon, authenticated;
revoke all on function public.sync_factory_user_email() from public, anon, authenticated;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references auth.users (id) on delete set null,
  customer_id uuid references public.factory_clients (id) on delete set null,
  model_name text,
  model_number text not null default '',
  sender_name text,
  total_pieces integer not null default 0 check (total_pieces >= 0),
  status text not null default 'قيد الانتظار',
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists client_id uuid references auth.users (id) on delete set null,
  add column if not exists customer_id uuid references public.factory_clients (id) on delete set null;

alter table public.orders
  add column if not exists model_name text,
  add column if not exists model_number text not null default '',
  add column if not exists sender_name text,
  add column if not exists colors text not null default '',
  add column if not exists color_names jsonb not null default '{}'::jsonb,
  add column if not exists sizes text not null default '',
  add column if not exists total_pieces integer not null default 0,
  add column if not exists delivered_pieces integer not null default 0,
  add column if not exists price_per_piece numeric(12, 2) not null default 0,
  add column if not exists paid_amount numeric(12, 2) not null default 0,
  add column if not exists expected_delivery_date date,
  add column if not exists model_image_url text,
  add column if not exists priority text not null default 'عادي',
  add column if not exists archived_at timestamptz;

alter table public.orders
  drop column if exists remaining_amount,
  drop column if exists total_amount,
  drop column if exists expected_total_amount;

alter table public.orders
  add column total_amount numeric(14, 2)
    generated always as (delivered_pieces * price_per_piece) stored,
  add column expected_total_amount numeric(14, 2)
    generated always as (total_pieces * price_per_piece) stored,
  add column remaining_amount numeric(14, 2)
    generated always as (delivered_pieces * price_per_piece - paid_amount) stored;

create table if not exists public.production_stages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  stage_name text not null check (stage_name in ('cutting', 'sewing', 'finishing', 'delivery')),
  worker_id uuid references auth.users (id) on delete set null,
  worker_name text,
  fabric text,
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
  add column if not exists fabric text,
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
  when 'تسليم' then 'delivery'
  else stage_name
end
where lower(trim(stage_name)) in ('تقطيع', 'قص', 'خياطة', 'تشطيب', 'تسليم');

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
      when 'مكتمل' then 'مكتمل'
      when 'تم الانتهاء' then 'مكتمل'
      when 'جاهز للتسليم' then 'جاهز للتسليم'
      when 'قيد الانتظار' then 'قيد الانتظار'
      when 'معلق' then 'معلق'
      when 'تحت الإنشاء' then 'تحت الإنشاء'
      when 'قيد الفرش' then 'قيد الفرش'
      when 'تم الفرش / جاهز للقص' then 'تم الفرش / جاهز للقص'
      when 'تم القص' then 'تم القص'
      when 'معلق - في انتظار الخياطة' then 'معلق - في انتظار الخياطة'
      when 'في الخياطة' then 'في الخياطة'
      when 'في الخط' then 'في الخياطة'
      when 'تحت التصنيع' then 'قيد الفرش'
      when 'قيد الإنتاج' then 'قيد الفرش'
      else 'قيد الانتظار'
    end;

alter table public.orders
  alter column total_pieces set default 0,
  alter column total_pieces set not null,
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
  add constraint orders_delivered_pieces_nonnegative check (delivered_pieces >= 0),
  add constraint orders_paid_amount_nonnegative check (paid_amount >= 0),
  add constraint orders_factory_status_check check (
    status in (
      'قيد الانتظار', 'معلق', 'تحت الإنشاء', 'قيد الفرش',
      'تم الفرش / جاهز للقص', 'تم القص', 'معلق - في انتظار الخياطة',
      'في الخياطة', 'جاهز للتسليم', 'مكتمل'
    )
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
  values
    (new.id, 'cutting', new.total_pieces),
    (new.id, 'sewing', new.total_pieces),
    (new.id, 'finishing', new.total_pieces),
    (new.id, 'delivery', new.total_pieces);
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
cross join (values ('cutting'), ('sewing'), ('finishing'), ('delivery')) as stage(stage_name)
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
  sender_name text,
  colors text,
  color_names jsonb,
  sizes text,
  total_pieces integer,
  delivered_pieces integer,
  archived_at timestamptz,
  expected_delivery_date date,
  model_image_url text,
  price_per_piece numeric,
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
           factory_order.sender_name,
           factory_order.colors,
           factory_order.color_names,
           factory_order.sizes,
           factory_order.total_pieces,
           factory_order.delivered_pieces,
           factory_order.archived_at,
           factory_order.expected_delivery_date,
           factory_order.model_image_url,
           factory_order.price_per_piece,
           factory_order.total_amount,
           factory_order.expected_total_amount,
           factory_order.paid_amount,
           factory_order.remaining_amount,
           factory_order.status,
           factory_order.created_at
    from public.orders as factory_order
    where factory_order.client_id = auth.uid()
    order by factory_order.created_at desc;
end;
$$;

drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text);
drop function if exists public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text, jsonb);
create function public.save_factory_order(
  requested_order_id uuid,
  requested_customer_id uuid,
  requested_model_name text,
  requested_model_number text,
  requested_quantity integer,
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
  requested_color_names jsonb
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
    or requested_delivered_pieces is null
    or requested_delivered_pieces < 0
    or (requested_quantity = 0 and requested_delivered_pieces > 0)
    or (requested_order_id is null and requested_delivered_pieces <> 0)
    or requested_price_per_piece is null
    or requested_price_per_piece < 0
    or requested_paid_amount is null
    or requested_paid_amount < 0
    or coalesce(jsonb_typeof(requested_color_names), '') <> 'object'
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
      'قيد الانتظار', 'معلق', 'تحت الإنشاء', 'قيد الفرش',
      'تم الفرش / جاهز للقص', 'تم القص', 'معلق - في انتظار الخياطة',
      'في الخياطة', 'جاهز للتسليم', 'مكتمل'
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

  if requested_order_id is null then
    if requested_status in ('قيد الفرش', 'تم الفرش / جاهز للقص', 'تم القص', 'معلق - في انتظار الخياطة', 'في الخياطة') then
      raise exception 'A new order must start in the waiting, paused, or under-construction state.';
    end if;
    insert into public.orders (
      client_id, customer_id, model_name, model_number, colors, color_names, sizes,
      total_pieces, delivered_pieces, price_per_piece, paid_amount, expected_delivery_date, model_image_url, priority, status
    )
    values (
      matched_client_id, matched_customer_id, resolved_model_name,
      coalesce(trim(requested_model_number), ''),
      coalesce(trim(requested_colors), ''), normalized_color_names, coalesce(trim(requested_sizes), ''),
      requested_quantity, requested_delivered_pieces,
      requested_price_per_piece, requested_paid_amount, requested_expected_delivery_date, requested_model_image_url, trim(requested_priority), trim(requested_status)
    )
    returning id into saved_order_id;
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
    if exists (
      select 1 from public.orders
      where id = requested_order_id and archived_at is not null
    ) then
      raise exception 'Archived factory orders cannot be edited.';
    end if;
    if exists (
      select 1 from public.orders
      where id = requested_order_id
        and delivered_pieces <> requested_delivered_pieces
    ) then
      raise exception 'Record deliveries through the delivery workflow; delivered totals cannot be edited.';
    end if;
    if requested_status = 'في الخياطة'
       and (current_status not in ('معلق - في انتظار الخياطة', 'في الخياطة') or current_total_pieces <= 0) then
      raise exception 'Move the order to waiting for sewing before an admin starts the sewing stage.';
    end if;
    if requested_status = 'معلق - في انتظار الخياطة'
       and current_status not in ('تم القص', 'معلق - في انتظار الخياطة') then
      raise exception 'An order must have completed cutting before waiting for sewing.';
    end if;
    if requested_status in ('قيد الفرش', 'تم الفرش / جاهز للقص', 'تم القص')
       and requested_status <> current_status then
      raise exception 'Cutting-stage statuses can only be advanced by the cutting workflow.';
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
        fabric = nullif(trim(requested_fabric), ''),
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
        total_pieces = requested_quantity,
        delivered_pieces = requested_delivered_pieces,
        price_per_piece = requested_price_per_piece,
        paid_amount = requested_paid_amount,
        expected_delivery_date = requested_expected_delivery_date,
        model_image_url = requested_model_image_url,
        priority = trim(requested_priority),
        status = trim(requested_status)
    where id = requested_order_id;
    if current_price_per_piece is distinct from requested_price_per_piece then
      update public.factory_deliveries
      set price_per_piece = requested_price_per_piece
      where order_id = requested_order_id;
    end if;
    if requested_status = 'في الخياطة' then
      update public.production_stages
      set status = 'قيد التنفيذ',
          updated_at = now()
      where order_id = requested_order_id
        and stage_name = 'sewing';
    end if;
    saved_order_id := requested_order_id;
  end if;

  return saved_order_id;
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
  if old.collection = 'settlements' then
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

create table if not exists public.factory_fabrics (
  id uuid primary key default gen_random_uuid(),
  stock_scope text not null default 'owner' check (stock_scope in ('owner', 'incoming')),
  customer_id uuid references public.factory_clients (id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  fabric_type text not null default '',
  color_name text not null default '',
  color_number text not null default '',
  color_hex text not null default '#FFFFFF' check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  unit text not null check (unit in ('متر', 'ثوب', 'لفة')),
  quantity_available numeric(14, 3) not null default 0 check (quantity_available >= 0),
  received_at timestamptz,
  received_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.factory_fabrics
  add column if not exists stock_scope text not null default 'owner',
  add column if not exists customer_id uuid references public.factory_clients (id) on delete set null,
  add column if not exists color_number text not null default '',
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users (id) on delete set null;

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

revoke all on function public.record_factory_auth_event(text) from public, anon, authenticated;

alter table public.factory_fabrics enable row level security;
alter table public.factory_fabric_transactions enable row level security;
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
     or requested_unit not in ('متر', 'ثوب', 'لفة') then
    raise exception 'Enter a valid fabric name, type, color, HEX value, and stock unit.';
  end if;

  if requested_fabric_id is null then
    insert into public.factory_fabrics (name, fabric_type, color_name, color_hex, unit)
    values (trim(requested_name), trim(coalesce(requested_type, '')),
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
    if current_scope <> 'owner' then
      raise exception 'Incoming fabric records cannot be edited as owner inventory.';
    end if;
    if current_unit is distinct from requested_unit and exists (
      select 1 from public.factory_fabric_transactions
      where fabric_id = requested_fabric_id
    ) then
      raise exception 'The stock unit cannot be changed after inventory transactions exist.';
    end if;
    update public.factory_fabrics
    set name = trim(requested_name),
        fabric_type = trim(coalesce(requested_type, '')),
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

create or replace function public.register_factory_incoming_fabric(
  requested_customer_id uuid,
  requested_name text,
  requested_type text,
  requested_color_name text,
  requested_color_number text,
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
     or length(coalesce(requested_type, '')) > 120
     or length(coalesce(requested_color_name, '')) > 64
     or length(coalesce(requested_color_number, '')) > 64
     or upper(coalesce(requested_color_hex, '')) !~ '^#[0-9A-F]{6}$'
     or requested_quantity is null or requested_quantity <= 0
     or requested_quantity > 99999999999.999
     or requested_unit is null or requested_unit not in ('متر', 'ثوب', 'لفة') then
    raise exception 'Enter valid incoming fabric details and a positive quantity.';
  end if;
  if requested_customer_id is not null and not exists (
    select 1 from public.factory_clients where id = requested_customer_id
  ) then
    raise exception 'Selected client was not found.';
  end if;

  insert into public.factory_fabrics (
    stock_scope, customer_id, name, fabric_type, color_name, color_number, color_hex,
    unit, quantity_available, received_at, received_by
  )
  values (
    'incoming', requested_customer_id, trim(requested_name),
    trim(coalesce(requested_type, '')), trim(coalesce(requested_color_name, '')),
    trim(coalesce(requested_color_number, '')), upper(requested_color_hex),
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

revoke all on function public.register_factory_incoming_fabric(uuid, text, text, text, text, text, numeric, text, timestamptz, text) from public, anon, authenticated;

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
  if exists (
    select 1 from public.factory_fabric_transactions
    where fabric_id = requested_fabric_id
  ) then
    raise exception 'Fabric items with inventory history cannot be deleted.';
  end if;
  delete from public.factory_fabrics
  where id = requested_fabric_id
    and stock_scope = 'owner'
    and quantity_available = 0;
  if not found then
    raise exception 'Only an unused fabric item with zero stock can be deleted.';
  end if;
end;
$$;

revoke all on function public.delete_factory_fabric(uuid) from public, anon, authenticated;

create or replace function public.reconcile_factory_fabric_usage(
  requested_order_id uuid,
  requested_fabric_id uuid,
  requested_quantity numeric
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
  if requested_order_id is null or requested_fabric_id is null
     or requested_quantity is null or requested_quantity <= 0
     or requested_quantity > 99999999999.999 then
    raise exception 'Select a fabric stock item and enter a positive amount to withdraw.';
  end if;

  select fabric_id, fabric_quantity
    into prior_fabric_id, prior_quantity
  from public.production_stages
  where order_id = requested_order_id and stage_name = 'cutting'
  for update;
  if not found then
    raise exception 'The cutting stage for this order does not exist.';
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

  select customer_id into order_customer_id
  from public.orders
  where id = requested_order_id;
  if resolved_fabric.customer_id is null then
    raise exception 'Assign incoming fabric to a client before using it for cutting.';
  end if;
  if resolved_fabric.customer_id is distinct from order_customer_id then
    raise exception 'Incoming fabric is assigned to a different client.';
  end if;

  prior_quantity := coalesce(prior_quantity, 0);
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

revoke all on function public.reconcile_factory_fabric_usage(uuid, uuid, numeric) from public, anon, authenticated;

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
  if current_order.archived_at is not null then
    raise exception 'Archived factory orders cannot receive new deliveries.';
  end if;
  if current_order.total_pieces <= 0 then
    raise exception 'Record the actual cut quantity before recording a delivery.';
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
  selected_colors text[] := array[]::text[];
  expected_counts jsonb := '{}'::jsonb;
  color_entry jsonb;
  raw_plys text;
  color_name text;
  color_plys numeric;
  plys_sum numeric := 0;
  calculated_total numeric;
begin
  if coalesce(jsonb_typeof(requested_color_ply_data), '') <> 'object'
     or coalesce(jsonb_typeof(requested_color_ply_data -> 'sizes'), '') <> 'array'
     or coalesce(jsonb_typeof(requested_color_ply_data -> 'colors'), '') <> 'array' then
    raise exception 'Cutting color, ply, and size selections are required.';
  end if;

  size_type := requested_color_ply_data ->> 'type';
  if coalesce(size_type, '') not in ('men', 'women', 'children') then
    raise exception 'Select a supported size category.';
  end if;

  for size_name in
    select jsonb_array_elements_text(requested_color_ply_data -> 'sizes')
  loop
    if (size_type in ('men', 'women') and size_name not in ('S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'))
       or (size_type = 'children' and size_name not in ('2', '4', '6', '8', '10', '12', '14', '16'))
       or size_name = any(selected_sizes) then
      raise exception 'The selected size list contains an invalid or duplicate size.';
    end if;
    selected_sizes := array_append(selected_sizes, size_name);
  end loop;
  if cardinality(selected_sizes) = 0 then
    raise exception 'Select at least one size.';
  end if;

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
  if cardinality(selected_colors) = 0 then
    raise exception 'Add at least one color with its ply count.';
  end if;

  calculated_total := plys_sum * cardinality(selected_sizes);
  if calculated_total < 1 or calculated_total > 2147483647 then
    raise exception 'The calculated cutting quantity exceeds the supported range.';
  end if;
  foreach size_name in array selected_sizes loop
    expected_counts := expected_counts || jsonb_build_object(size_name, plys_sum::integer::text);
  end loop;
  normalized_sizes := jsonb_build_object('type', size_type, 'counts', expected_counts);
  if requested_size_data is distinct from normalized_sizes then
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
drop function if exists public.read_factory_cutting_clients();
create function public.read_factory_cutting_clients()
returns table (id uuid, name text)
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
    select customer.id, customer.name
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
  requested_bolt_count integer,
  requested_technical_notes text,
  requested_fabric_id uuid,
  requested_fabric_quantity numeric
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_customer public.factory_clients%rowtype;
  submitted_by_name text;
  normalized_sizes jsonb;
  normalized_colors text;
  cut_total integer;
  total_plys integer;
  resolved_fabric_name text;
begin
  if not public.has_active_factory_role(array['cutting']) then
    raise exception 'Only active cutting supervisors can submit new cutting orders.';
  end if;
  if requested_order_id is null
     or requested_customer_id is null
     or (length(trim(coalesce(requested_model_name, ''))) = 0
         and length(trim(coalesce(requested_model_number, ''))) = 0)
     or requested_size_data is null
     or coalesce(jsonb_typeof(requested_size_data), '') <> 'object'
     or length(trim(coalesce(requested_fabric, ''))) = 0
     or requested_bolt_count is null or requested_bolt_count < 1 then
    raise exception 'A valid model, size and color ply selections, fabric, and bolt count are required.';
  end if;

  select *
    into matched_customer
  from public.factory_clients
  where id = requested_customer_id
  for key share;
  if not found then
    raise exception 'The selected factory customer does not exist.';
  end if;

  select coalesce(nullif(trim(name), ''), username)
    into submitted_by_name
  from public.users
  where id = auth.uid()
    and role = 'cutting'
    and status = 'active';
  if not found then
    raise exception 'The active cutting supervisor profile could not be identified.';
  end if;

  select breakdown.normalized_sizes, breakdown.normalized_colors,
         breakdown.total_pieces, breakdown.total_plys
    into normalized_sizes, normalized_colors, cut_total, total_plys
  from public.calculate_factory_cutting_breakdown(requested_size_data, requested_color_ply_data) as breakdown;

  insert into public.orders (
    id, client_id, customer_id, model_name, model_number, sender_name, colors, color_names, sizes,
    total_pieces, status, model_image_url
  )
  values (
    requested_order_id, matched_customer.user_id, matched_customer.id,
    coalesce(nullif(trim(coalesce(requested_model_name, '')), ''),
             nullif(trim(coalesce(requested_model_number, '')), '')),
    coalesce(trim(requested_model_number), ''),
    submitted_by_name,
    normalized_colors,
    coalesce((
      select jsonb_object_agg(upper(trim(color_entry ->> 'color')), trim(color_entry ->> 'name'))
      from jsonb_array_elements(requested_color_ply_data -> 'colors') as color_entry
      where length(trim(coalesce(color_entry ->> 'name', ''))) > 0
    ), '{}'::jsonb),
    normalized_sizes::text,
    0,
    'قيد الفرش',
    nullif(trim(coalesce(requested_model_image_url, '')), '')
  );

  resolved_fabric_name := public.reconcile_factory_fabric_usage(
    requested_order_id, requested_fabric_id, requested_fabric_quantity
  );

  update public.production_stages
  set target_quantity = 0,
      completed_quantity = 0,
      fabric = resolved_fabric_name,
      fabric_id = requested_fabric_id,
      fabric_quantity = requested_fabric_quantity,
      bolt_count = requested_bolt_count,
      layer_count = total_plys,
      color_ply_data = requested_color_ply_data,
      technical_notes = coalesce(trim(requested_technical_notes), ''),
      status = 'قيد الفرش',
      updated_at = now()
  where order_id = requested_order_id and stage_name = 'cutting';

  return total_plys;
end;
$$;

drop function if exists public.update_factory_cutting_progress(uuid, jsonb, jsonb, text, integer, text);
drop function if exists public.update_factory_cutting_progress(uuid, jsonb, jsonb, text, integer, text, uuid, numeric);
create function public.update_factory_cutting_progress(
  requested_order_id uuid,
  requested_size_data jsonb,
  requested_color_ply_data jsonb,
  requested_fabric text,
  requested_bolt_count integer,
  requested_technical_notes text,
  requested_fabric_id uuid,
  requested_fabric_quantity numeric
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
begin
  if not public.has_active_factory_role(array['cutting']) then
    raise exception 'Only active cutting supervisors can update cutting progress.';
  end if;
  if requested_order_id is null
     or length(trim(coalesce(requested_fabric, ''))) = 0
     or requested_bolt_count is null or requested_bolt_count < 1 then
    raise exception 'A valid order, fabric, and positive bolt count are required.';
  end if;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found or current_order.archived_at is not null
     or current_order.status not in ('قيد الانتظار', 'معلق', 'تحت الإنشاء', 'قيد الفرش') then
    raise exception 'This order is not accepting live cutting updates.';
  end if;

  select breakdown.normalized_sizes, breakdown.normalized_colors,
         breakdown.total_pieces, breakdown.total_plys
    into normalized_sizes, normalized_colors, calculated_total, total_plys
  from public.calculate_factory_cutting_breakdown(requested_size_data, requested_color_ply_data) as breakdown;

  resolved_fabric_name := public.reconcile_factory_fabric_usage(
    requested_order_id, requested_fabric_id, requested_fabric_quantity
  );

  update public.orders
  set colors = normalized_colors,
      color_names = coalesce((
        select jsonb_object_agg(upper(trim(color_entry ->> 'color')), trim(color_entry ->> 'name'))
        from jsonb_array_elements(requested_color_ply_data -> 'colors') as color_entry
        where length(trim(coalesce(color_entry ->> 'name', ''))) > 0
      ), '{}'::jsonb),
      sizes = normalized_sizes::text,
      status = 'قيد الفرش'
  where id = requested_order_id;

  update public.production_stages
  set fabric = resolved_fabric_name,
      fabric_id = requested_fabric_id,
      fabric_quantity = requested_fabric_quantity,
      bolt_count = requested_bolt_count,
      layer_count = total_plys,
      color_ply_data = requested_color_ply_data,
      technical_notes = coalesce(trim(requested_technical_notes), ''),
      status = 'قيد الفرش',
      updated_at = now()
  where order_id = requested_order_id
    and stage_name = 'cutting';
  if not found then
    raise exception 'The cutting stage for this order does not exist.';
  end if;

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
     or current_order.status <> 'قيد الفرش' then
    raise exception 'Only an order currently being spread can be marked ready.';
  end if;

  select layer_count
    into current_layer_count
  from public.production_stages
  where order_id = requested_order_id
    and stage_name = 'cutting'
  for update;
  if not found or current_layer_count < 1 then
    raise exception 'Save at least one positive color ply before marking the bed ready.';
  end if;

  update public.orders
  set status = 'تم الفرش / جاهز للقص'
  where id = requested_order_id;
  update public.production_stages
  set status = 'تم الفرش / جاهز للقص',
      updated_at = now()
  where order_id = requested_order_id
    and stage_name = 'cutting';
end;
$$;

drop function if exists public.finish_factory_cutting(uuid, jsonb, text, text);
drop function if exists public.finish_factory_cutting(uuid, jsonb, text, text, text, integer, integer);
drop function if exists public.finish_factory_cutting(uuid, jsonb, text, text, text, integer, integer, text);
drop function if exists public.finish_factory_cutting(uuid, jsonb, jsonb, text, text, integer, text);
drop function if exists public.finish_factory_cutting(uuid, jsonb, jsonb, text, text, integer, text, uuid, numeric);
create function public.finish_factory_cutting(
  requested_order_id uuid,
  requested_size_data jsonb,
  requested_color_ply_data jsonb,
  requested_model_image_url text,
  requested_fabric text,
  requested_bolt_count integer,
  requested_technical_notes text,
  requested_fabric_id uuid,
  requested_fabric_quantity numeric
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
  cut_total integer;
  total_plys integer;
  resolved_fabric_name text;
begin
  if not public.has_active_factory_role(array['cutting']) then
    raise exception 'Only active cutting supervisors can finish cutting.';
  end if;
  if requested_order_id is null or requested_size_data is null
     or coalesce(jsonb_typeof(requested_size_data), '') <> 'object'
     or length(trim(coalesce(requested_fabric, ''))) = 0
     or requested_bolt_count is null or requested_bolt_count < 1 then
    raise exception 'A valid order, size and color ply selections, fabric, and bolt count are required.';
  end if;

  select breakdown.normalized_sizes, breakdown.normalized_colors,
         breakdown.total_pieces, breakdown.total_plys
    into normalized_sizes, normalized_colors, cut_total, total_plys
  from public.calculate_factory_cutting_breakdown(requested_size_data, requested_color_ply_data) as breakdown;

  select *
    into current_order
  from public.orders
  where id = requested_order_id
  for update;
  if not found or current_order.archived_at is not null then
    raise exception 'The active factory order was not found.';
  end if;
  if current_order.status <> 'تم الفرش / جاهز للقص' then
    raise exception 'Mark the bed ready for cutting before recording its final piece count.';
  end if;

  resolved_fabric_name := public.reconcile_factory_fabric_usage(
    requested_order_id, requested_fabric_id, requested_fabric_quantity
  );

  update public.orders
  set sizes = normalized_sizes::text,
      colors = normalized_colors,
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
      fabric_id = requested_fabric_id,
      fabric_quantity = requested_fabric_quantity,
      bolt_count = requested_bolt_count,
      layer_count = total_plys,
      color_ply_data = requested_color_ply_data,
      technical_notes = coalesce(trim(requested_technical_notes), ''),
      status = 'مكتمل',
      updated_at = now()
  where order_id = requested_order_id
    and stage_name = 'cutting';

  return cut_total;
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
    raise exception 'Archived factory orders cannot be deleted.';
  end if;
  if current_order.delivered_pieces > 0
     or current_order.paid_amount > 0
     or exists (
       select 1
       from public.factory_deliveries
       where order_id = requested_order_id
     ) then
    raise exception 'Orders with payment or delivery history cannot be deleted.';
  end if;

  delete from public.orders
  where id = requested_order_id;
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
  order_paid_total numeric(14, 2) := 0;
  payments_total numeric(14, 2) := 0;
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
         round(coalesce(sum(paid_amount), 0), 2)
    into delivered_total, order_paid_total
  from public.orders
  where customer_id = matched_client.id
    and archived_at is null;

  select coalesce(sum(round((payload ->> 'amount')::numeric, 2)), 0)
    into payments_total
  from public.factory_records
  where collection = 'payments'
    and payload ->> 'customerId' = matched_client.id::text
    and (
      matched_client.account_period_started_at is null
      or created_at >= matched_client.account_period_started_at
    );

  closing_balance := round(
    opening_balance + delivered_total - order_paid_total - payments_total,
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
      'orderPaidTotal', order_paid_total,
      'paymentsTotal', payments_total,
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
    or (client_id = auth.uid() and public.has_active_factory_role(array['client']))
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
    or (stage_name = 'sewing' and public.has_active_factory_role(array['sewing']))
    or exists (
      select 1
      from public.orders
      where orders.id = production_stages.order_id
        and orders.client_id = auth.uid()
        and public.has_active_factory_role(array['client'])
    )
    or (worker_id = auth.uid() and public.has_active_factory_role(array['worker']))
  );

drop policy if exists "Supervisors update their production stages" on public.production_stages;
create policy "Supervisors update their production stages"
  on public.production_stages for update to authenticated
  using (
    public.is_active_factory_admin()
    or (
      stage_name = 'cutting'
      and public.has_active_factory_role(array['cutting'])
      and exists (select 1 from public.orders where orders.id = production_stages.order_id and orders.archived_at is null)
    )
    or (
      stage_name = 'sewing'
      and public.has_active_factory_role(array['sewing'])
      and exists (select 1 from public.orders where orders.id = production_stages.order_id and orders.archived_at is null)
    )
  )
  with check (
    public.is_active_factory_admin()
    or (
      stage_name = 'cutting'
      and public.has_active_factory_role(array['cutting'])
      and exists (select 1 from public.orders where orders.id = production_stages.order_id and orders.archived_at is null)
    )
    or (
      stage_name = 'sewing'
      and public.has_active_factory_role(array['sewing'])
      and exists (select 1 from public.orders where orders.id = production_stages.order_id and orders.archived_at is null)
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
      or (collection in ('attendance', 'advances', 'payroll') and public.has_active_factory_role(array['cutting']))
    )
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
        and orders.client_id = auth.uid()
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
drop policy if exists "Admins manage factory clients" on public.factory_clients;
create policy "Admins manage factory clients"
  on public.factory_clients for all to authenticated
  using (public.is_active_factory_admin())
  with check (public.is_active_factory_admin());
revoke all on public.factory_clients from public, anon, authenticated;
grant select on public.factory_clients to authenticated;
grant insert (name, phone, notes) on public.factory_clients to authenticated;
grant update (name, phone, notes, updated_at) on public.factory_clients to authenticated;
grant select (id, client_id, customer_id, model_name, model_number, colors, sizes, total_pieces, delivered_pieces, archived_at, status, priority, created_at)
  on public.orders to authenticated;
grant select (sender_name) on public.orders to authenticated;
grant select (model_image_url) on public.orders to authenticated;
grant select on public.production_stages to authenticated;
grant select, insert, update on public.factory_records to authenticated;
grant select on public.factory_deliveries to authenticated;
grant select on public.factory_fabrics to authenticated;
grant select on public.factory_fabric_transactions to authenticated;
grant select on public.factory_live_signals to authenticated;
grant select on public.factory_auth_events to authenticated;
grant update (completed_quantity, status, updated_at) on public.production_stages to authenticated;
revoke all on function public.has_active_factory_role(text[]) from public, anon, authenticated;
grant execute on function public.has_active_factory_role(text[]) to authenticated;
revoke all on function public.create_factory_order_stages() from public, anon, authenticated;
revoke all on function public.sync_factory_client_profile() from public, anon, authenticated;
revoke all on function public.read_factory_orders_admin() from public, anon, authenticated;
grant execute on function public.read_factory_orders_admin() to authenticated;
revoke all on function public.read_factory_orders_client() from public, anon, authenticated;
grant execute on function public.read_factory_orders_client() to authenticated;
revoke all on function public.read_factory_cutting_clients() from public, anon, authenticated;
grant execute on function public.read_factory_cutting_clients() to authenticated;
revoke all on function public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text, jsonb) to authenticated;
revoke all on function public.record_factory_delivery(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.record_factory_delivery(uuid, integer, text) to authenticated;
revoke all on function public.calculate_factory_cutting_breakdown(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.submit_factory_cutting(uuid, uuid, text, text, jsonb, jsonb, text, text, integer, text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.submit_factory_cutting(uuid, uuid, text, text, jsonb, jsonb, text, text, integer, text, uuid, numeric) to authenticated;
revoke all on function public.update_factory_cutting_progress(uuid, jsonb, jsonb, text, integer, text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.update_factory_cutting_progress(uuid, jsonb, jsonb, text, integer, text, uuid, numeric) to authenticated;
revoke all on function public.save_factory_fabric(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_factory_fabric(uuid, text, text, text, text, text) to authenticated;
revoke all on function public.record_factory_fabric_receipt(uuid, numeric, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_factory_fabric_receipt(uuid, numeric, timestamptz, text) to authenticated;
revoke all on function public.register_factory_incoming_fabric(uuid, text, text, text, text, text, numeric, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.register_factory_incoming_fabric(uuid, text, text, text, text, text, numeric, text, timestamptz, text) to authenticated;
revoke all on function public.assign_factory_incoming_fabric(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_factory_incoming_fabric(uuid, uuid) to authenticated;
revoke all on function public.adjust_factory_fabric_stock(uuid, numeric, timestamptz, text) from public, anon, authenticated;
grant execute on function public.adjust_factory_fabric_stock(uuid, numeric, timestamptz, text) to authenticated;
revoke all on function public.delete_factory_fabric(uuid) from public, anon, authenticated;
grant execute on function public.delete_factory_fabric(uuid) to authenticated;
revoke all on function public.reconcile_factory_fabric_usage(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.guard_factory_financial_history() from public, anon, authenticated;
revoke all on function public.emit_factory_live_signal() from public, anon, authenticated;
revoke all on function public.emit_factory_client_live_signal() from public, anon, authenticated;
revoke all on function public.record_factory_auth_event(text) from public, anon, authenticated;
grant execute on function public.record_factory_auth_event(text) to authenticated;
revoke all on function public.mark_factory_cutting_ready(uuid) from public, anon, authenticated;
grant execute on function public.mark_factory_cutting_ready(uuid) to authenticated;
revoke all on function public.finish_factory_cutting(uuid, jsonb, jsonb, text, text, integer, text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.finish_factory_cutting(uuid, jsonb, jsonb, text, text, integer, text, uuid, numeric) to authenticated;
revoke all on function public.delete_factory_order(uuid) from public, anon, authenticated;
grant execute on function public.delete_factory_order(uuid) to authenticated;
revoke all on function public.save_factory_payment(uuid, uuid, numeric, date, text, text, text) from public, anon, authenticated;
grant execute on function public.save_factory_payment(uuid, uuid, numeric, date, text, text, text) to authenticated;
revoke all on function public.settle_factory_client_account(uuid) from public, anon, authenticated;
grant execute on function public.settle_factory_client_account(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('factory-model-images', 'factory-model-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Factory staff upload model images" on storage.objects;
create policy "Factory staff upload model images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'factory-model-images'
    and public.has_active_factory_role(array['admin', 'cutting'])
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
      'users',
      'factory_clients',
      'factory_records',
      'factory_deliveries'
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

notify pgrst, 'reload schema';
