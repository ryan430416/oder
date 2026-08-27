alter table public.stores
add column if not exists service_periods text[] not null
default array['breakfast', 'lunch']::text[];

update public.stores
set service_periods = array['breakfast', 'lunch']::text[]
where service_periods is null or cardinality(service_periods) = 0;

create or replace function public.set_store_service_periods(
  p_token text,
  p_store_id text,
  p_periods text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin app_users%rowtype;
  v_store stores%rowtype;
begin
  select * into v_admin from app_users where user_id = session_user_id(p_token);
  if not found or v_admin.role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'not_admin');
  end if;
  if p_periods is null
     or cardinality(p_periods) = 0
     or not (p_periods <@ array['breakfast', 'lunch']::text[]) then
    return jsonb_build_object('ok', false, 'code', 'need_service_period');
  end if;

  update stores
  set service_periods = p_periods,
      open_time = case when 'breakfast' = any(p_periods) then '08:30'::time else '11:00'::time end,
      close_time = case when 'lunch' = any(p_periods) then '13:00'::time else '10:30'::time end
  where store_id = p_store_id
  returning * into v_store;

  if not found then return jsonb_build_object('ok', false, 'code', 'no_store'); end if;
  return jsonb_build_object('ok', true, 'store', to_jsonb(v_store));
end
$$;

create or replace function public.validate_order_service_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periods text[];
  v_time time;
begin
  select service_periods into v_periods from stores where store_id = new.store_id;
  v_time := (new.pickup_time at time zone 'Asia/Taipei')::time;
  if not (
    ('breakfast' = any(v_periods) and v_time >= '08:30'::time and v_time < '10:30'::time)
    or ('lunch' = any(v_periods) and v_time >= '11:00'::time and v_time < '13:00'::time)
  ) then
    raise exception 'pickup time is outside the selected service periods'
      using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists orders_validate_service_period on public.orders;
create trigger orders_validate_service_period
before insert or update of pickup_time, store_id on public.orders
for each row execute function public.validate_order_service_period();

revoke execute on function public.set_store_service_periods(text, text, text[]) from public;
grant execute on function public.set_store_service_periods(text, text, text[]) to anon;
