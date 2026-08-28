create or replace function public.is_service_pickup_time(p_periods text[], p_time time)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    (
      'breakfast' = any(p_periods)
      and (
        p_time between '08:35'::time and '08:45'::time
        or p_time between '09:30'::time and '09:40'::time
        or p_time between '10:25'::time and '10:35'::time
      )
    )
    or (
      'lunch' = any(p_periods)
      and (
        p_time between '11:20'::time and '11:30'::time
        or p_time between '12:15'::time and '13:00'::time
      )
    )
    or (
      'afternoon_tea' = any(p_periods)
      and (
        p_time between '17:15'::time and '17:30'::time
        or p_time between '18:15'::time and '18:25'::time
      )
    )
$$;

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
     or not (p_periods <@ array['breakfast', 'lunch', 'afternoon_tea']::text[]) then
    return jsonb_build_object('ok', false, 'code', 'need_service_period');
  end if;

  update stores
  set service_periods = p_periods,
      open_time = case
        when 'breakfast' = any(p_periods) then '08:35'::time
        when 'lunch' = any(p_periods) then '11:20'::time
        else '17:15'::time
      end,
      close_time = case
        when 'afternoon_tea' = any(p_periods) then '18:25'::time
        when 'lunch' = any(p_periods) then '13:00'::time
        else '10:35'::time
      end
  where store_id = p_store_id
  returning * into v_store;

  if not found then return jsonb_build_object('ok', false, 'code', 'no_store'); end if;
  return jsonb_build_object('ok', true, 'store', to_jsonb(v_store));
end
$$;

update public.stores
set open_time = case
      when 'breakfast' = any(service_periods) then '08:35'::time
      when 'lunch' = any(service_periods) then '11:20'::time
      else '17:15'::time
    end,
    close_time = case
      when 'afternoon_tea' = any(service_periods) then '18:25'::time
      when 'lunch' = any(service_periods) then '13:00'::time
      else '10:35'::time
    end;

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
  if not is_service_pickup_time(v_periods, v_time) then
    raise exception 'pickup time is outside the selected service periods'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create or replace function public.create_order(
  p_token text,
  p_customer_name text,
  p_store_id text,
  p_pickup_time timestamptz,
  p_payment_method text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store stores%rowtype;
  v_user app_users%rowtype;
  v_order orders%rowtype;
  v_item jsonb;
  v_product products%rowtype;
  v_qty integer;
  v_total numeric(12,2) := 0;
  v_local_time time;
  v_items jsonb := '[]'::jsonb;
  v_order_item order_items%rowtype;
begin
  select * into v_user from app_users where user_id = session_user_id(p_token);
  if not found or v_user.role <> 'customer' then
    return jsonb_build_object('ok', false, 'code', 'bad_login');
  end if;
  if length(trim(coalesce(p_customer_name, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'need_name');
  end if;
  select * into v_store from stores where store_id = p_store_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_store'); end if;
  if v_store.status <> 'open' then return jsonb_build_object('ok', false, 'code', 'store_closed'); end if;
  if p_pickup_time < now() + interval '15 minutes'
     or p_pickup_time > now() + interval '24 hours'
     or extract(minute from p_pickup_time)::integer % 5 <> 0
     or extract(second from p_pickup_time) <> 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_pickup');
  end if;
  v_local_time := (p_pickup_time at time zone 'Asia/Taipei')::time;
  if not is_service_pickup_time(v_store.service_periods, v_local_time) then
    return jsonb_build_object('ok', false, 'code', 'invalid_pickup');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_items');
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    begin
      v_qty := (v_item->>'quantity')::integer;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'invalid_items');
    end;
    select * into v_product
    from products
    where product_id = v_item->>'product_id'
      and store_id = p_store_id
      and status = 'active';
    if not found or v_qty < 1 or v_qty > 99 then
      return jsonb_build_object('ok', false, 'code', 'invalid_items');
    end if;
    v_total := v_total + v_product.price * v_qty;
  end loop;

  update app_users set name = trim(p_customer_name) where user_id = v_user.user_id;
  insert into orders(store_id, customer_id, customer_name, pickup_time, total, payment_method)
  values (
    p_store_id, v_user.user_id, trim(p_customer_name), p_pickup_time, v_total,
    case when p_payment_method in ('cash', 'campus') then p_payment_method else 'cash' end
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from products where product_id = v_item->>'product_id';
    insert into order_items(order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (
      v_order.order_id, v_product.product_id, v_product.product_name,
      v_product.price, v_qty, v_product.price * v_qty
    )
    returning * into v_order_item;
    v_items := v_items || to_jsonb(v_order_item);
  end loop;

  insert into notifications(role, store_id, order_id, key, vars)
  values ('store', p_store_id, v_order.order_id, 'notice_new_order',
          jsonb_build_object('name', trim(p_customer_name), 'id', v_order.order_id));

  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order), 'items', v_items);
end
$$;

revoke execute on function public.is_service_pickup_time(text[], time) from public;
revoke execute on function public.set_store_service_periods(text, text, text[]) from public;
revoke execute on function public.create_order(text, text, text, timestamptz, text, jsonb) from public;
grant execute on function public.set_store_service_periods(text, text, text[]) to anon;
grant execute on function public.create_order(text, text, text, timestamptz, text, jsonb) to anon;
