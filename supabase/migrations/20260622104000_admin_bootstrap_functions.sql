create or replace function public.promote_user_to_admin(
  target_email text,
  target_name text default null,
  activate_access boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text;
  auth_user auth.users%rowtype;
  next_now timestamptz := timezone('utc', now());
begin
  normalized_email := lower(trim(target_email));

  if normalized_email is null or normalized_email = '' then
    raise exception 'Informe um email valido.'
      using errcode = '22023';
  end if;

  select *
  into auth_user
  from auth.users
  where lower(email) = normalized_email
  limit 1;

  if auth_user.id is null then
    raise exception 'Usuario com email % nao encontrado em auth.users.', normalized_email
      using errcode = 'P0002';
  end if;

  update auth.users
  set
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', 'admin', 'is_admin', true),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || case
        when coalesce(trim(target_name), '') = '' then '{}'::jsonb
        else jsonb_build_object('name', trim(target_name))
      end,
    updated_at = next_now
  where id = auth_user.id;

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
  values (
    auth_user.id,
    coalesce(nullif(trim(target_name), ''), auth_user.raw_user_meta_data ->> 'name', split_part(auth_user.email, '@', 1)),
    auth_user.email,
    'Mensal',
    case when activate_access then 'active' else 'expired' end,
    0,
    'BRL',
    case when activate_access then next_now else null end,
    case when activate_access then next_now + interval '30 days' else null end,
    case when activate_access then next_now + interval '30 days' else null end,
    activate_access,
    true
  )
  on conflict (user_id) do update
  set
    name = excluded.name,
    email = excluded.email,
    plan_name = excluded.plan_name,
    plan_status = excluded.plan_status,
    started_at = excluded.started_at,
    expires_at = excluded.expires_at,
    next_billing_at = excluded.next_billing_at,
    grant_access = excluded.grant_access,
    is_admin = true,
    updated_at = next_now;

  return auth_user.id;
end;
$$;

create or replace function public.bootstrap_admin_user(
  target_email text,
  target_password text,
  target_name text default 'Administrador',
  activate_access boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text;
  normalized_name text;
  auth_user_id uuid;
  auth_instance_id uuid := coalesce((select id from auth.instances limit 1), '00000000-0000-0000-0000-000000000000'::uuid);
  next_now timestamptz := timezone('utc', now());
begin
  normalized_email := lower(trim(target_email));
  normalized_name := coalesce(nullif(trim(target_name), ''), 'Administrador');

  if normalized_email is null or normalized_email = '' then
    raise exception 'Informe um email valido.'
      using errcode = '22023';
  end if;

  if target_password is null or length(trim(target_password)) < 6 then
    raise exception 'A senha deve ter pelo menos 6 caracteres.'
      using errcode = '22023';
  end if;

  select id
  into auth_user_id
  from auth.users
  where lower(email) = normalized_email
  limit 1;

  if auth_user_id is null then
    auth_user_id := gen_random_uuid();

    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      auth_user_id,
      auth_instance_id,
      'authenticated',
      'authenticated',
      normalized_email,
      extensions.crypt(target_password, extensions.gen_salt('bf')),
      next_now,
      jsonb_build_object(
        'provider', 'email',
        'providers', jsonb_build_array('email'),
        'role', 'admin',
        'is_admin', true
      ),
      jsonb_build_object('name', normalized_name),
      next_now,
      next_now
    );
  end if;

  if not exists (
    select 1
    from auth.identities
    where user_id = auth_user_id
      and provider = 'email'
  ) then
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      auth_user_id,
      jsonb_build_object(
        'sub', auth_user_id::text,
        'email', normalized_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      auth_user_id::text,
      next_now,
      next_now,
      next_now
    );
  end if;

  perform public.promote_user_to_admin(normalized_email, normalized_name, activate_access);

  return auth_user_id;
end;
$$;

revoke all on function public.promote_user_to_admin(text, text, boolean) from public, anon, authenticated;
revoke all on function public.bootstrap_admin_user(text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.promote_user_to_admin(text, text, boolean) to service_role;
grant execute on function public.bootstrap_admin_user(text, text, text, boolean) to service_role;

comment on function public.promote_user_to_admin(text, text, boolean) is
'Promove um usuario existente para administrador, atualizando auth.users e user_access_profiles.';

comment on function public.bootstrap_admin_user(text, text, text, boolean) is
'Cria ou reaproveita um usuario por email e aplica permissao administrativa com acesso ativo.';
