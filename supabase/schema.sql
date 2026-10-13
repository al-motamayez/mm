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

create table if not exists public.factory_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
begin
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
    and lower(new.email) <> 'zero0@accounts.al-motamayez.invalid' then
    raise exception 'This username is reserved.';
  end if;

  insert into public.users (id, name, username, phone, role, status)
  values (new.id, user_name, user_username, user_phone, null, 'pending');
  return new;
end;
$$;

drop trigger if exists create_pending_factory_profile on auth.users;
drop trigger if exists create_pending_factory_user on auth.users;
create trigger create_pending_factory_user
  after insert on auth.users
  for each row execute procedure public.create_pending_factory_user();

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
grant insert (id, name, username, phone, role, status) on public.users to authenticated;
revoke all on function public.is_active_factory_admin() from public, anon, authenticated;
grant execute on function public.is_active_factory_admin() to authenticated;
revoke all on function public.delete_user_by_admin(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_by_admin(uuid) to authenticated;
revoke all on function public.create_pending_factory_user() from public, anon, authenticated;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references auth.users (id) on delete set null,
  customer_id uuid references public.factory_clients (id) on delete set null,
  model_name text,
  model_number text not null default '',
  total_pieces integer not null default 1 check (total_pieces > 0),
  status text not null default 'جديد',
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists client_id uuid references auth.users (id) on delete set null,
  add column if not exists customer_id uuid references public.factory_clients (id) on delete set null;

alter table public.orders
  add column if not exists model_name text,
  add column if not exists model_number text not null default '',
  add column if not exists colors text not null default '',
  add column if not exists sizes text not null default '',
  add column if not exists total_pieces integer not null default 1,
  add column if not exists delivered_pieces integer not null default 0,
  add column if not exists price_per_piece numeric(12, 2) not null default 0,
  add column if not exists paid_amount numeric(12, 2) not null default 0,
  add column if not exists total_amount numeric(14, 2)
    generated always as (total_pieces * price_per_piece) stored,
  add column if not exists remaining_amount numeric(14, 2)
    generated always as (total_pieces * price_per_piece - paid_amount) stored;

create table if not exists public.production_stages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  stage_name text not null check (stage_name in ('cutting', 'sewing', 'finishing', 'delivery')),
  worker_id uuid references auth.users (id) on delete set null,
  worker_name text,
  fabric text,
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
  drop constraint if exists orders_delivered_pieces_range,
  drop constraint if exists orders_delivered_pieces_nonnegative,
  drop constraint if exists orders_amounts_range,
  drop constraint if exists orders_factory_status_check;

update public.orders as factory_order
set model_name = coalesce(
      nullif(trim(factory_order.model_name), ''),
      nullif(trim(factory_order.model_number), ''),
      'موديل'
    ),
    model_number = coalesce(nullif(trim(factory_order.model_number), ''), ''),
    total_pieces = greatest(coalesce(factory_order.total_pieces, 1), 1),
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
      when 'قيد الإنتاج' then 'قيد الإنتاج'
      else 'قيد الإنتاج'
    end;

alter table public.orders
  alter column model_name drop not null;

alter table public.orders
  alter column status set default 'قيد الإنتاج';
alter table public.orders
  add constraint orders_total_pieces_positive check (total_pieces > 0),
  add constraint orders_delivered_pieces_nonnegative check (delivered_pieces >= 0),
  add constraint orders_amounts_range check (paid_amount between 0 and total_pieces * price_per_piece),
  add constraint orders_factory_status_check check (
    status in ('قيد الإنتاج', 'جاهز للتسليم', 'مكتمل')
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

create or replace function public.save_factory_order(
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
  requested_paid_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_order_id uuid;
  matched_customer_id uuid;
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
    or requested_quantity <= 0
    or requested_delivered_pieces is null
    or requested_delivered_pieces < 0
    or requested_price_per_piece is null
    or requested_price_per_piece < 0
    or requested_paid_amount is null
    or requested_paid_amount < 0
    or requested_paid_amount > requested_quantity * requested_price_per_piece
    or requested_status is null
    or requested_status not in ('قيد الإنتاج', 'جاهز للتسليم', 'مكتمل') then
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
    insert into public.orders (
      client_id, customer_id, model_name, model_number, colors, sizes,
      total_pieces, delivered_pieces, price_per_piece, paid_amount, status
    )
    values (
      matched_client_id, matched_customer_id, resolved_model_name,
      coalesce(trim(requested_model_number), ''),
      coalesce(trim(requested_colors), ''), coalesce(trim(requested_sizes), ''),
      requested_quantity, requested_delivered_pieces,
      requested_price_per_piece, requested_paid_amount, trim(requested_status)
    )
    returning id into saved_order_id;
    update public.production_stages
    set fabric = nullif(trim(requested_fabric), ''),
        line_name = nullif(trim(requested_line_name), '')
    where order_id = saved_order_id;
  else
    perform 1
    from public.orders
    where id = requested_order_id
    for update;
    if not found then
      raise exception 'Factory order not found.';
    end if;

    update public.production_stages
    set target_quantity = requested_quantity,
        completed_quantity = case
      when stage_name = 'delivery' then least(requested_delivered_pieces, requested_quantity)
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
        status = trim(requested_status)
    where id = requested_order_id;
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

create index if not exists factory_records_collection_created_idx
  on public.factory_records (collection, created_at desc);
create index if not exists factory_records_owner_collection_idx
  on public.factory_records (owner_id, collection);

alter table public.orders enable row level security;
alter table public.production_stages enable row level security;
alter table public.factory_records enable row level security;

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
    or (stage_name = 'cutting' and public.has_active_factory_role(array['cutting']))
    or (stage_name = 'sewing' and public.has_active_factory_role(array['sewing']))
  )
  with check (
    public.is_active_factory_admin()
    or (stage_name = 'cutting' and public.has_active_factory_role(array['cutting']))
    or (stage_name = 'sewing' and public.has_active_factory_role(array['sewing']))
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
      or (collection = 'leaves' and public.has_active_factory_role(array['worker', 'cutting', 'sewing']))
      or (collection = 'tasks' and public.has_active_factory_role(array['worker']))
    )
  );

revoke all on public.orders, public.production_stages, public.factory_records from public, anon, authenticated;
alter table public.factory_clients enable row level security;
drop policy if exists "Admins manage factory clients" on public.factory_clients;
create policy "Admins manage factory clients"
  on public.factory_clients for all to authenticated
  using (public.is_active_factory_admin())
  with check (public.is_active_factory_admin());
revoke all on public.factory_clients from public, anon, authenticated;
grant select, insert, update on public.factory_clients to authenticated;
grant select (id, client_id, customer_id, model_name, model_number, colors, sizes, total_pieces, delivered_pieces, status, created_at)
  on public.orders to authenticated;
grant delete on public.orders to authenticated;
grant select on public.production_stages to authenticated;
grant select, insert, update, delete on public.factory_records to authenticated;
grant update (completed_quantity, status, updated_at) on public.production_stages to authenticated;
revoke all on function public.has_active_factory_role(text[]) from public, anon, authenticated;
grant execute on function public.has_active_factory_role(text[]) to authenticated;
revoke all on function public.create_factory_order_stages() from public, anon, authenticated;
revoke all on function public.sync_factory_client_profile() from public, anon, authenticated;
revoke all on function public.read_factory_orders_admin() from public, anon, authenticated;
grant execute on function public.read_factory_orders_admin() to authenticated;
revoke all on function public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric) from public, anon, authenticated;
grant execute on function public.save_factory_order(uuid, uuid, text, text, integer, text, text, text, text, text, integer, numeric, numeric) to authenticated;

-- Create this Auth user with email auto-confirmed before running the schema:
--   email: mohamed01007033454@gmail.com
-- Set its password privately in the Supabase Dashboard; never store it here.
update public.users as account
set name = 'ZERO0',
    username = 'ZERO0',
    role = 'admin',
    status = 'active',
    updated_at = now()
from auth.users as auth_user
where account.id = auth_user.id
  and lower(auth_user.email) in (
    'mohamed01007033454@gmail.com',
    'zero0@accounts.al-motamayez.invalid'
  );

insert into public.users (id, name, username, role, status)
select auth_user.id, 'ZERO0', 'ZERO0', 'admin', 'active'
from auth.users as auth_user
where lower(auth_user.email) = 'mohamed01007033454@gmail.com'
on conflict (id) do update
set name = excluded.name,
    username = excluded.username,
    role = excluded.role,
    status = excluded.status,
    updated_at = now();

notify pgrst, 'reload schema';
