create extension if not exists pgcrypto;

create table if not exists public.user_access_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text not null,
  plan_name text not null default 'Mensal',
  plan_status text not null default 'expired' check (plan_status in ('active', 'expired', 'trial', 'canceled')),
  amount numeric(12, 2) not null default 0,
  currency text not null default 'BRL',
  started_at timestamptz,
  expires_at timestamptz,
  next_billing_at timestamptz,
  grant_access boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists user_access_profiles_email_idx
  on public.user_access_profiles (lower(email));

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_user_access_profiles_updated_at on public.user_access_profiles;

create trigger trg_user_access_profiles_updated_at
before update on public.user_access_profiles
for each row
execute function public.set_current_timestamp_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_access_profiles (
    user_id,
    name,
    email,
    plan_name,
    plan_status,
    grant_access,
    is_admin
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    'Mensal',
    'expired',
    false,
    coalesce((new.raw_app_meta_data ->> 'is_admin')::boolean, false)
  )
  on conflict (user_id) do update
  set
    name = excluded.name,
    email = excluded.email,
    is_admin = excluded.is_admin,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_access_profile on auth.users;

create trigger on_auth_user_created_access_profile
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

insert into public.user_access_profiles (
  user_id,
  name,
  email,
  plan_name,
  plan_status,
  amount,
  currency,
  started_at,
  expires_at,
  next_billing_at,
  grant_access,
  is_admin
)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'name', split_part(users.email, '@', 1)),
  users.email,
  'Mensal',
  'expired',
  0,
  'BRL',
  null,
  null,
  null,
  false,
  coalesce((users.raw_app_meta_data ->> 'is_admin')::boolean, false)
from auth.users as users
on conflict (user_id) do update
set
  name = excluded.name,
  email = excluded.email,
  is_admin = excluded.is_admin,
  updated_at = timezone('utc', now());

alter table public.user_access_profiles enable row level security;

create or replace function public.is_admin_user(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_access_profiles profile
    where profile.user_id = coalesce(target_user_id, auth.uid())
      and profile.is_admin = true
  )
  or coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
  or coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false);
$$;

drop policy if exists "user_access_profiles_select_self_or_admin" on public.user_access_profiles;
create policy "user_access_profiles_select_self_or_admin"
on public.user_access_profiles
for select
using (
  auth.uid() = user_id
  or public.is_admin_user()
);

drop policy if exists "user_access_profiles_update_admin" on public.user_access_profiles;
create policy "user_access_profiles_update_admin"
on public.user_access_profiles
for update
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "user_access_profiles_insert_admin" on public.user_access_profiles;
create policy "user_access_profiles_insert_admin"
on public.user_access_profiles
for insert
with check (public.is_admin_user());

create or replace view public.admin_user_overview as
select
  profile.user_id as id,
  profile.name,
  profile.email,
  profile.plan_name,
  profile.plan_status,
  profile.amount,
  profile.currency,
  profile.started_at,
  profile.expires_at,
  profile.next_billing_at,
  profile.grant_access,
  profile.is_admin,
  case
    when profile.plan_status = 'active' and profile.grant_access = true then 'active'
    when profile.plan_status = 'trial' and profile.grant_access = true then 'trial'
    when profile.plan_status = 'canceled' then 'canceled'
    else 'expired'
  end as status
from public.user_access_profiles profile;

create or replace function public.admin_set_user_access(
  target_user_id uuid,
  next_plan_status text default null,
  next_plan_name text default null,
  next_amount numeric default null,
  next_currency text default null,
  next_started_at timestamptz default null,
  next_expires_at timestamptz default null,
  next_billing_at timestamptz default null,
  next_grant_access boolean default null,
  next_is_admin boolean default null
)
returns public.user_access_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.user_access_profiles;
begin
  if not public.is_admin_user() then
    raise exception 'Apenas administradores podem atualizar acessos.'
      using errcode = '42501';
  end if;

  update public.user_access_profiles profile
  set
    plan_status = coalesce(next_plan_status, profile.plan_status),
    plan_name = coalesce(next_plan_name, profile.plan_name),
    amount = coalesce(next_amount, profile.amount),
    currency = coalesce(next_currency, profile.currency),
    started_at = coalesce(next_started_at, profile.started_at),
    expires_at = coalesce(next_expires_at, profile.expires_at),
    next_billing_at = coalesce(next_billing_at, profile.next_billing_at),
    grant_access = coalesce(next_grant_access, profile.grant_access),
    is_admin = coalesce(next_is_admin, profile.is_admin)
  where profile.user_id = target_user_id
  returning * into updated_row;

  if updated_row.user_id is null then
    raise exception 'Usuario nao encontrado.'
      using errcode = 'P0002';
  end if;

  return updated_row;
end;
$$;

comment on table public.user_access_profiles is
'Controle administrativo de acesso, plano e cobranca mensal dos usuarios.';

comment on view public.admin_user_overview is
'Visao pronta para listar usuarios ativos, vencidos, em teste e administradores.';

comment on function public.admin_set_user_access(uuid, text, text, numeric, text, timestamptz, timestamptz, timestamptz, boolean, boolean) is
'Atualiza status de plano, liberacao de uso e proxima cobranca de um usuario.';
