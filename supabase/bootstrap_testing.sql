-- Testing bootstrap only. Do not run this in a hardened production project.
-- Creates guest login helper, admin / 1234, and store-account RPCs.
-- Re-run the full file after pulling updates; it is idempotent.

create or replace function public.provision_email_user(
  p_email text,
  p_password text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', left(coalesce(p_display_name, ''), 80)),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email),
    'email', v_id::text, now(), now(), now()
  );

  return v_id;
end
$$;

create or replace function public.create_guest_login()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := 'guest_' || replace(v_id::text, '-', '') || '@campus-order.test';
  v_password text := replace(gen_random_uuid()::text, '-', '') || 'Aa1';
begin
  perform public.provision_email_user(v_email, v_password, '');
  return jsonb_build_object('ok', true, 'email', v_email, 'password', v_password);
end
$$;

revoke all on function public.provision_email_user(text, text, text) from public, anon, authenticated;
revoke all on function public.create_guest_login() from public;
grant execute on function public.create_guest_login() to anon, authenticated;

do $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id from auth.users where email = 'admin@campus-order.test';
  if v_admin_id is null then
    v_admin_id := public.provision_email_user('admin@campus-order.test', '1234', '測試管理員');
  else
    update auth.users
    set encrypted_password = crypt('1234', gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = v_admin_id;
  end if;

  update public.profiles
  set display_name = '測試管理員',
      role = 'admin',
      store_id = null,
      status = 'active'
  where id = v_admin_id;
end
$$;

create or replace function public.create_store_account(
  p_store_id uuid,
  p_username text,
  p_password text,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_user_id uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'not_admin');
  end if;
  if not exists (select 1 from public.stores where id = p_store_id) then
    return jsonb_build_object('ok', false, 'code', 'no_store');
  end if;
  v_email := lower(trim(coalesce(p_username, '')));
  if v_email not like '%@%' then
    v_email := v_email || '@campus-order.test';
  end if;
  if char_length(trim(coalesce(p_username, ''))) < 1 or char_length(coalesce(p_password, '')) < 4 then
    return jsonb_build_object('ok', false, 'code', 'invalid_account');
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    return jsonb_build_object('ok', false, 'code', 'username_taken');
  end if;

  v_user_id := public.provision_email_user(
    v_email, p_password, coalesce(nullif(trim(p_display_name), ''), trim(p_username))
  );
  update public.profiles
  set role = 'store',
      store_id = p_store_id,
      display_name = coalesce(nullif(trim(p_display_name), ''), trim(p_username)),
      status = 'active'
  where id = v_user_id;

  return jsonb_build_object('ok', true, 'user_id', v_user_id, 'username', trim(p_username));
end
$$;

create or replace function public.reset_store_password(p_store_id uuid, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'not_admin');
  end if;
  if char_length(coalesce(p_password, '')) < 4 then
    return jsonb_build_object('ok', false, 'code', 'password_too_short');
  end if;
  select id into v_user_id
  from public.profiles
  where store_id = p_store_id and role = 'store'
  limit 1;
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'no_user');
  end if;
  update auth.users
  set encrypted_password = crypt(p_password, gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now())
  where id = v_user_id;
  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.create_store_account(uuid, text, text, text) from public;
revoke execute on function public.reset_store_password(uuid, text) from public;
grant execute on function public.create_store_account(uuid, text, text, text) to authenticated;
grant execute on function public.reset_store_password(uuid, text) to authenticated;
