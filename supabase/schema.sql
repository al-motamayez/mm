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
    raise exception 'The existing public.users table contains plaintext passwords. Back up any needed non-password data, remove the insecure table, then run this schema.';
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

create or replace function public.create_pending_factory_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_username text;
  user_name text;
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

  if lower(user_username) = 'zero0'
    and lower(new.email) <> 'zero0@accounts.al-motamayez.invalid' then
    raise exception 'This username is reserved.';
  end if;

  insert into public.users (id, name, username, role, status)
  values (new.id, user_name, user_username, null, 'pending');
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

drop policy if exists "Admins activate accounts" on public.users;
create policy "Admins activate accounts"
  on public.users
  for update
  to authenticated
  using (public.is_active_factory_admin())
  with check (public.is_active_factory_admin());

revoke all on public.users from anon, authenticated;
grant select, update on public.users to authenticated;
revoke all on function public.is_active_factory_admin() from public, anon, authenticated;
grant execute on function public.is_active_factory_admin() to authenticated;
revoke all on function public.create_pending_factory_user() from public, anon, authenticated;

create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  price numeric not null default 0 check (price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references auth.users (id) on delete set null,
  client_name text not null,
  model_id uuid references public.models (id) on delete set null,
  quantity integer not null check (quantity > 0),
  status text not null default 'جديد',
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists client_id uuid references auth.users (id) on delete set null;

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
set target_quantity = greatest(orders.quantity, stage.completed_quantity)
from public.orders
where stage.order_id = orders.id
  and stage.target_quantity = 0;

update public.production_stages
set target_quantity = completed_quantity
where target_quantity < completed_quantity;

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
set client_id = account.id
from public.users as account
where factory_order.client_id is null
  and lower(factory_order.client_name) = lower(account.username)
  and account.role = 'client'
  and account.status = 'active';

create or replace function public.create_factory_order_stages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.production_stages (order_id, stage_name, target_quantity)
  values
    (new.id, 'cutting', new.quantity),
    (new.id, 'sewing', new.quantity),
    (new.id, 'finishing', new.quantity),
    (new.id, 'delivery', new.quantity);
  return new;
end;
$$;

drop trigger if exists create_factory_order_stages on public.orders;
create trigger create_factory_order_stages
  after insert on public.orders
  for each row execute procedure public.create_factory_order_stages();

insert into public.production_stages (order_id, stage_name, target_quantity)
select factory_order.id, stage.stage_name, factory_order.quantity
from public.orders as factory_order
cross join (values ('cutting'), ('sewing'), ('finishing'), ('delivery')) as stage(stage_name)
where not exists (
  select 1
  from public.production_stages as existing_stage
  where existing_stage.order_id = factory_order.id
    and existing_stage.stage_name = stage.stage_name
);

drop function if exists public.save_factory_order(uuid, text, text, integer, text);

create or replace function public.save_factory_order(
  requested_order_id uuid,
  requested_model_name text,
  requested_client_name text,
  requested_quantity integer,
  requested_status text,
  requested_fabric text,
  requested_line_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_order_id uuid;
  saved_model_id uuid;
  matched_client_id uuid;
begin
  if not public.is_active_factory_admin() then
    raise exception 'Only active admins can create or edit factory orders.';
  end if;
  if length(trim(requested_model_name)) = 0
    or length(trim(requested_client_name)) = 0
    or requested_quantity <= 0
    or length(trim(requested_status)) = 0 then
    raise exception 'Invalid factory order data.';
  end if;

  select id into matched_client_id
  from public.users
  where lower(username) = lower(trim(requested_client_name))
    and role = 'client'
    and status = 'active'
  limit 1;

  if matched_client_id is null then
    raise exception 'No active client account matches the supplied username.';
  end if;

  if requested_order_id is null then
    insert into public.models (name)
    values (trim(requested_model_name))
    returning id into saved_model_id;

    insert into public.orders (client_id, client_name, model_id, quantity, status)
    values (matched_client_id, trim(requested_client_name), saved_model_id, requested_quantity, trim(requested_status))
    returning id into saved_order_id;
    update public.production_stages
    set fabric = nullif(trim(requested_fabric), ''),
        line_name = nullif(trim(requested_line_name), '')
    where order_id = saved_order_id;
  else
    select model_id into saved_model_id
    from public.orders
    where id = requested_order_id;
    if not found then
      raise exception 'Factory order not found.';
    end if;

    update public.models
    set name = trim(requested_model_name)
    where id = saved_model_id;
    update public.production_stages
    set target_quantity = requested_quantity,
        fabric = nullif(trim(requested_fabric), ''),
        line_name = nullif(trim(requested_line_name), '')
    where order_id = requested_order_id;
    update public.orders
    set client_id = matched_client_id,
        client_name = trim(requested_client_name),
        quantity = requested_quantity,
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
      and tablename in ('users', 'models', 'orders', 'production_stages')
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

alter table public.models enable row level security;
alter table public.orders enable row level security;
alter table public.production_stages enable row level security;

drop policy if exists "Authenticated users read models" on public.models;
create policy "Authenticated users read models"
  on public.models for select to authenticated
  using (public.has_active_factory_role(array['admin', 'client', 'worker', 'cutting', 'sewing']));

drop policy if exists "Admins manage models" on public.models;
create policy "Admins manage models"
  on public.models for all to authenticated
  using (public.is_active_factory_admin())
  with check (public.is_active_factory_admin());

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

revoke all on public.models, public.orders, public.production_stages from anon, authenticated;
grant select, delete on public.models to authenticated;
grant select, delete on public.orders to authenticated;
grant select on public.production_stages to authenticated;
grant update (completed_quantity, status, updated_at) on public.production_stages to authenticated;
revoke all on function public.has_active_factory_role(text[]) from public, anon, authenticated;
grant execute on function public.has_active_factory_role(text[]) to authenticated;
revoke all on function public.create_factory_order_stages() from public, anon, authenticated;
revoke all on function public.save_factory_order(uuid, text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.save_factory_order(uuid, text, text, integer, text, text, text) to authenticated;

-- Run this schema first, then create this Auth user with email auto-confirmed,
-- and run this schema again to promote the generated account row:
--   email: zero0@accounts.al-motamayez.invalid
-- Set its password privately in the Supabase Dashboard; never store it here.
update public.users as account
set name = 'ZERO0',
    username = 'ZERO0',
    role = 'admin',
    status = 'active',
    updated_at = now()
from auth.users as auth_user
where account.id = auth_user.id
  and lower(auth_user.email) = 'zero0@accounts.al-motamayez.invalid';

notify pgrst, 'reload schema';
