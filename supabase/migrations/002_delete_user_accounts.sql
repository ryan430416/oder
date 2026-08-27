create or replace function public.delete_user_account(p_token text, p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin app_users%rowtype;
  v_target app_users%rowtype;
begin
  select * into v_admin
  from app_users
  where user_id = session_user_id(p_token);

  if not found or v_admin.role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'not_admin');
  end if;

  select * into v_target
  from app_users
  where user_id = p_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_user');
  end if;
  if v_target.role = 'admin' then
    return jsonb_build_object('ok', false, 'code', 'cannot_delete_admin');
  end if;

  delete from notifications where user_id = v_target.user_id;
  delete from password_resets where user_id = v_target.user_id;
  delete from app_users where user_id = v_target.user_id;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_target.user_id,
    'role', v_target.role,
    'store_id', coalesce(v_target.store_id, '')
  );
end
$$;

revoke execute on function public.delete_user_account(text, text) from public;
grant execute on function public.delete_user_account(text, text) to anon;
