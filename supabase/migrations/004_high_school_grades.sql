create or replace function public.update_customer_profile(p_token text, p_name text, p_grade text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user app_users%rowtype;
begin
  select * into v_user from app_users where user_id = session_user_id(p_token);
  if not found or v_user.role <> 'customer' then
    return jsonb_build_object('ok', false, 'code', 'bad_login');
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'need_name');
  end if;
  if coalesce(p_grade, '') not in ('high_1', 'high_2', 'high_3') then
    return jsonb_build_object('ok', false, 'code', 'invalid_grade');
  end if;
  update app_users
  set name = trim(p_name), grade = p_grade
  where user_id = v_user.user_id
  returning * into v_user;
  return jsonb_build_object('ok', true, 'user', to_jsonb(v_user));
end
$$;

revoke execute on function public.update_customer_profile(text, text, text) from public;
grant execute on function public.update_customer_profile(text, text, text) to anon;
