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
  drop column if exists total_amount;

alter table public.orders
  add column total_amount numeric(14, 2)
    generated always as (delivered_pieces * price_per_piece) stored,
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
  add column if not exists bolt_count integer not null default 0,
  add column if not exists layer_count integer not null default 0,
  add column if not exists color_ply_data jsonb not null default '{}'::jsonb,
  add column if not exists technical_notes text not null default '',
  add column if not exists line_name text,
  add column if not exists target_quantity integer not null default 0,
  add column if not exists completed_quantity integer not null default 0;

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
  sizes text,
  total_pieces integer,
  delivered_pieces integer,
  archived_at timestamptz,
  expected_delivery_date date,
  model_image_url text,
  price_per_piece numeric,
  total_amount numeric,
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
           factory_order.sizes,
           factory_order.total_pieces,
           factory_order.delivered_pieces,
           factory_order.archived_at,
           factory_order.expected_delivery_date,
           factory_order.model_image_url,
           factory_order.price_per_piece,
           factory_order.total_amount,
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
  requested_priority text
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
      client_id, customer_id, model_name, model_number, colors, sizes,
      total_pieces, delivered_pieces, price_per_piece, paid_amount, expected_delivery_date, model_image_url, priority, status
    )
    values (
      matched_client_id, matched_customer_id, resolved_model_name,
      coalesce(trim(requested_model_number), ''),
      coalesce(trim(requested_colors), ''), coalesce(trim(requested_sizes), ''),
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
       or raw_plys !~ '^[0-9]+$' then
      raise exception 'Each color must be a valid HEX value with a positive integer ply count.';
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
  requested_technical_notes text
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
    id, client_id, customer_id, model_name, model_number, sender_name, colors, sizes,
    total_pieces, status, model_image_url
  )
  values (
    requested_order_id, matched_customer.user_id, matched_customer.id,
    coalesce(nullif(trim(coalesce(requested_model_name, '')), ''),
             nullif(trim(coalesce(requested_model_number, '')), '')),
    coalesce(trim(requested_model_number), ''),
    submitted_by_name,
    normalized_colors,
    normalized_sizes::text,
    0,
    'قيد الفرش',
    nullif(trim(coalesce(requested_model_image_url, '')), '')
  );

  update public.production_stages
  set target_quantity = 0,
      completed_quantity = 0,
      fabric = trim(requested_fabric),
      bolt_count = requested_bolt_count,
      layer_count = total_plys,
      color_ply_data = requested_color_ply_data,
      technical_notes = coalesce(trim(requested_technical_notes), ''),
      status = 'قيد الفرش',
      updated_at = now()
  where order_id = requested_order_id
    and stage_name = 'cutting';

  return total_plys;
end;
$$;

drop function if exists public.update_factory_cutting_progress(uuid, jsonb, jsonb, text, integer, text);
create function public.update_factory_cutting_progress(
  requested_order_id uuid,
  requested_size_data jsonb,
  requested_color_ply_data jsonb,
  requested_fabric text,
  requested_bolt_count integer,
  requested_technical_notes text
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

  update public.orders
  set colors = normalized_colors,
      sizes = normalized_sizes::text,
      status = 'قيد الفرش'
  where id = requested_order_id;

  update public.production_stages
  set fabric = trim(requested_fabric),
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
create function public.finish_factory_cutting(
  requested_order_id uuid,
  requested_size_data jsonb,
  requested_color_ply_data jsonb,
  requested_model_image_url text,
  requested_fabric text,
  requested_bolt_count integer,
  requested_technical_notes text
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

  update public.orders
  set sizes = normalized_sizes::text,
      colors = normalized_colors,
      model_image_url = coalesce(nullif(trim(requested_model_image_url), ''), model_image_url),
      total_pieces = cut_total,
      status = 'تم القص'
  where id = requested_order_id;

  update public.production_stages
  set target_quantity = cut_total,
      completed_quantity = cut_total,
      fabric = trim(requested_fabric),
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

revoke all on public.orders, public.production_stages, public.factory_records, public.factory_deliveries from public, anon, authenticated;
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
revoke all on function public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text) from public, anon, authenticated;
grant execute on function public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric, date, text, text) to authenticated;
revoke all on function public.record_factory_delivery(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.record_factory_delivery(uuid, integer, text) to authenticated;
revoke all on function public.calculate_factory_cutting_breakdown(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.submit_factory_cutting(uuid, uuid, text, text, jsonb, jsonb, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.submit_factory_cutting(uuid, uuid, text, text, jsonb, jsonb, text, text, integer, text) to authenticated;
revoke all on function public.update_factory_cutting_progress(uuid, jsonb, jsonb, text, integer, text) from public, anon, authenticated;
grant execute on function public.update_factory_cutting_progress(uuid, jsonb, jsonb, text, integer, text) to authenticated;
revoke all on function public.mark_factory_cutting_ready(uuid) from public, anon, authenticated;
grant execute on function public.mark_factory_cutting_ready(uuid) to authenticated;
revoke all on function public.finish_factory_cutting(uuid, jsonb, jsonb, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.finish_factory_cutting(uuid, jsonb, jsonb, text, text, integer, text) to authenticated;
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

notify pgrst, 'reload schema';
