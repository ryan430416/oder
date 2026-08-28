-- Allow placing orders 24/7. Pickup must still be a school window today or tomorrow (Taipei).

create or replace function public.pickup_is_within_order_window(p_pickup timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    p_pickup >= now() + interval '15 minutes'
    and (p_pickup at time zone 'Asia/Taipei')::date
        <= (timezone('Asia/Taipei', now()))::date + 1
$$;

create or replace function public.create_order(
  p_store_id uuid,
  p_customer_name text,
  p_pickup_time timestamptz,
  p_payment_method text,
  p_items jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_store public.stores%rowtype;
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_total numeric(12,2) := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'bad_login');
  end if;
  select * into v_profile from public.profiles
  where id = auth.uid() and role = 'customer' and status = 'active';
  if not found then return jsonb_build_object('ok', false, 'code', 'bad_login'); end if;
  if char_length(trim(coalesce(p_customer_name, ''))) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'code', 'need_name');
  end if;

  select * into v_existing from public.orders
  where customer_id = auth.uid() and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'order', to_jsonb(v_existing));
  end if;

  select * into v_store from public.stores where id = p_store_id and status = 'open' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'store_closed'); end if;
  if not public.pickup_is_within_order_window(p_pickup_time)
     or extract(minute from p_pickup_time)::integer % 5 <> 0
     or extract(second from p_pickup_time) <> 0
     or not public.is_service_pickup_time(
       v_store.service_periods,
       (p_pickup_time at time zone 'Asia/Taipei')::time
     ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_pickup');
  end if;
  if p_payment_method not in ('cash', 'campus') then
    return jsonb_build_object('ok', false, 'code', 'invalid_payment');
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
    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid
      and store_id = p_store_id and status = 'active'
    for update;
    if not found or v_qty not between 1 and 99 then
      return jsonb_build_object('ok', false, 'code', 'invalid_items');
    end if;
    v_total := v_total + (v_product.price * v_qty);
  end loop;

  update public.profiles
  set display_name = trim(p_customer_name)
  where id = auth.uid();

  insert into public.orders(
    customer_id, customer_name, customer_grade, store_id, pickup_time,
    payment_method, total, status, idempotency_key
  )
  values (
    auth.uid(), trim(p_customer_name), v_profile.grade, p_store_id, p_pickup_time,
    p_payment_method, v_total, 'pending', p_idempotency_key
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    insert into public.order_items(
      order_id, product_id, product_name_snapshot, unit_price, quantity, subtotal
    )
    values (
      v_order.id, v_product.id, v_product.name, v_product.price, v_qty, v_product.price * v_qty
    );
  end loop;

  insert into public.notifications(store_id, order_id, type, message)
  values (p_store_id, v_order.id, 'new_order', '新訂單 ' || v_order.order_number);

  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order));
exception
  when unique_violation then
    select * into v_existing from public.orders
    where customer_id = auth.uid() and idempotency_key = p_idempotency_key;
    return jsonb_build_object('ok', true, 'duplicate', true, 'order', to_jsonb(v_existing));
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'invalid_items');
end
$$;

revoke execute on function public.pickup_is_within_order_window(timestamptz) from public;
revoke execute on function public.create_order(uuid, text, timestamptz, text, jsonb, uuid) from public;
grant execute on function public.create_order(uuid, text, timestamptz, text, jsonb, uuid) to authenticated;
