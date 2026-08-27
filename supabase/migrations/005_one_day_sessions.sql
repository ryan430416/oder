alter table public.demo_sessions
alter column expires_at set default (now() + interval '1 day');

update public.demo_sessions
set expires_at = least(expires_at, created_at + interval '1 day');

create or replace function public.demo_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user app_users%rowtype;
  v_token text;
  v_expires_at timestamptz;
begin
  select u.* into v_user
  from accounts a
  join app_users u on u.user_id = a.user_id
  where a.username = trim(p_username) and a.password = p_password;

  if not found then return jsonb_build_object('ok', false, 'code', 'bad_login'); end if;
  if v_user.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'disabled');
  end if;

  delete from demo_sessions where expires_at <= now();
  insert into demo_sessions(user_id)
  values (v_user.user_id)
  returning token, expires_at into v_token, v_expires_at;

  return jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'user_id', v_user.user_id,
      'name', v_user.name,
      'grade', v_user.grade,
      'role', v_user.role,
      'store_id', coalesce(v_user.store_id, ''),
      'token', v_token,
      'expires_at', v_expires_at
    )
  );
end
$$;

create or replace function public.create_guest_session(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user app_users%rowtype;
  v_token text;
  v_expires_at timestamptz;
begin
  insert into app_users(user_id, name, role)
  values (
    'guest_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24),
    coalesce(nullif(trim(p_name), ''), '學生小明'),
    'customer'
  )
  returning * into v_user;

  insert into demo_sessions(user_id)
  values (v_user.user_id)
  returning token, expires_at into v_token, v_expires_at;

  return jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'user_id', v_user.user_id,
      'name', v_user.name,
      'grade', v_user.grade,
      'role', 'customer',
      'store_id', '',
      'token', v_token,
      'expires_at', v_expires_at
    )
  );
end
$$;

revoke execute on function public.demo_login(text, text) from public;
revoke execute on function public.create_guest_session(text) from public;
grant execute on function public.demo_login(text, text) to anon;
grant execute on function public.create_guest_session(text) to anon;
