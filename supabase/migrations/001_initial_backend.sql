create extension if not exists pgcrypto;

create sequence if not exists public.store_number_seq start 1;

create table if not exists public.stores (
  store_id text primary key default ('S' || lpad(nextval('public.store_number_seq')::text, 3, '0')),
  store_name text not null check (length(trim(store_name)) > 0),
  description text not null default '',
  open_time time not null default '10:00',
  close_time time not null default '20:00',
  status text not null default 'open' check (status in ('open', 'closed')),
  image text not null default '🏪',
  created_at timestamptz not null default now()
);

create table if not exists public.app_users (
  user_id text primary key,
  name text not null,
  role text not null check (role in ('customer', 'store', 'admin')),
  store_id text references public.stores(store_id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  username text primary key,
  password text not null,
  user_id text not null unique references public.app_users(user_id) on delete cascade
);

create table if not exists public.demo_sessions (
  token text primary key default gen_random_uuid()::text,
  user_id text not null references public.app_users(user_id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  product_id text primary key default ('P_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  store_id text not null references public.stores(store_id) on delete cascade,
  category text not null default '—',
  product_name text not null check (length(trim(product_name)) > 0),
  description text not null default '',
  price numeric(12, 2) not null check (price >= 0),
  image text not null default '🍽️',
  status text not null default 'active' check (status in ('active', 'soldout')),
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  order_id text primary key default ('ORD_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  store_id text not null,
  customer_id text not null,
  customer_name text not null,
  pickup_time timestamptz not null,
  total numeric(12, 2) not null check (total >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'campus')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  order_item_id text primary key default ('OI_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  order_id text not null references public.orders(order_id) on delete cascade,
  product_id text not null,
  product_name text not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 99),
  subtotal numeric(12, 2) not null check (subtotal >= 0)
);

create table if not exists public.reviews (
  review_id text primary key default ('REV_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  store_id text not null,
  order_id text,
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  notification_id text primary key default ('N_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  role text not null check (role in ('customer', 'store', 'admin')),
  store_id text,
  user_id text,
  order_id text,
  key text not null,
  vars jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.password_resets (
  reset_id text primary key default ('PW_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  username text not null,
  user_id text not null,
  store_id text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists products_store_idx on public.products(store_id);
create index if not exists orders_store_created_idx on public.orders(store_id, created_at desc);
create index if not exists orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists notifications_store_idx on public.notifications(store_id, created_at desc);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

-- Remove signatures from earlier test iterations before recreating secured RPCs.
drop function if exists public.create_order(text, text, text, timestamptz, text, jsonb);
drop function if exists public.cancel_order(text, text, text);
drop function if exists public.get_notifications(text, text);
drop function if exists public.mark_notification_read(text, text, text);

alter table public.stores enable row level security;
alter table public.app_users enable row level security;
alter table public.accounts enable row level security;
alter table public.demo_sessions enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.password_resets enable row level security;

drop policy if exists "public catalog stores" on public.stores;
create policy "public catalog stores" on public.stores for select to anon using (true);
drop policy if exists "public catalog products" on public.products;
create policy "public catalog products" on public.products for select to anon using (true);

-- Test-only: these SELECT policies enable cross-device order refresh and Realtime.
-- Do not use them for production; migrate to Supabase Auth and owner-scoped RLS first.
drop policy if exists "test read orders" on public.orders;
create policy "test read orders" on public.orders for select to anon using (true);
drop policy if exists "test read order items" on public.order_items;
create policy "test read order items" on public.order_items for select to anon using (true);

revoke all on public.accounts, public.demo_sessions, public.app_users,
  public.notifications, public.password_resets, public.reviews from anon;
grant select on public.stores, public.products, public.orders, public.order_items to anon;

create or replace function public.session_user_id(p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id
  from demo_sessions s
  join app_users u on u.user_id = s.user_id
  where s.token = p_token and s.expires_at > now() and u.status = 'active'
  limit 1
$$;

create or replace function public.demo_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user app_users%rowtype;
  v_token text;
begin
  select u.* into v_user
  from accounts a
  join app_users u on u.user_id = a.user_id
  where a.username = trim(p_username) and a.password = p_password;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'bad_login');
  end if;
  if v_user.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'disabled');
  end if;

  delete from demo_sessions where expires_at <= now();
  insert into demo_sessions(user_id) values (v_user.user_id) returning token into v_token;
  return jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'user_id', v_user.user_id,
      'name', v_user.name,
      'role', v_user.role,
      'store_id', coalesce(v_user.store_id, ''),
      'token', v_token
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
begin
  insert into app_users(user_id, name, role)
  values (
    'guest_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24),
    coalesce(nullif(trim(p_name), ''), '學生小明'),
    'customer'
  )
  returning * into v_user;
  insert into demo_sessions(user_id) values (v_user.user_id) returning token into v_token;
  return jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'user_id', v_user.user_id,
      'name', v_user.name,
      'role', 'customer',
      'store_id', '',
      'token', v_token
    )
  );
end
$$;

create or replace function public.demo_logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from demo_sessions where token = p_token;
  return jsonb_build_object('ok', true);
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
     or extract(minute from p_pickup_time)::integer % 15 <> 0
     or extract(second from p_pickup_time) <> 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_pickup');
  end if;
  v_local_time := (p_pickup_time at time zone 'Asia/Taipei')::time;
  if v_store.open_time < v_store.close_time then
    if v_local_time < v_store.open_time or v_local_time >= v_store.close_time then
      return jsonb_build_object('ok', false, 'code', 'invalid_pickup');
    end if;
  elsif v_store.open_time > v_store.close_time then
    if v_local_time < v_store.open_time and v_local_time >= v_store.close_time then
      return jsonb_build_object('ok', false, 'code', 'invalid_pickup');
    end if;
  else
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

create or replace function public.update_order_status(p_token text, p_order_id text, p_next_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user app_users%rowtype;
  v_order orders%rowtype;
  v_valid boolean := false;
begin
  select u.* into v_user from app_users u where u.user_id = session_user_id(p_token);
  if not found or v_user.role <> 'store' then
    return jsonb_build_object('ok', false, 'code', 'not_store');
  end if;
  select * into v_order from orders where order_id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_order'); end if;
  if v_order.store_id <> v_user.store_id then
    return jsonb_build_object('ok', false, 'code', 'not_admin');
  end if;
  v_valid :=
    (v_order.status = 'pending' and p_next_status in ('accepted', 'rejected'))
    or (v_order.status = 'accepted' and p_next_status = 'preparing')
    or (v_order.status = 'preparing' and p_next_status = 'ready')
    or (v_order.status = 'ready' and p_next_status = 'completed');
  if not v_valid then return jsonb_build_object('ok', false, 'code', 'invalid_status'); end if;

  update orders set status = p_next_status, updated_at = now()
  where order_id = p_order_id returning * into v_order;
  insert into notifications(role, user_id, store_id, order_id, key, vars)
  values ('customer', v_order.customer_id, v_order.store_id, v_order.order_id,
          'notice_status', jsonb_build_object('id', v_order.order_id, 'status', p_next_status));
  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order));
end
$$;

create or replace function public.cancel_order(p_token text, p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user app_users%rowtype;
  v_order orders%rowtype;
  v_is_staff boolean := false;
begin
  select * into v_order from orders where order_id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_order'); end if;
  if v_order.status in ('completed', 'cancelled', 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'cannot_cancel');
  end if;
  select u.* into v_user from app_users u where u.user_id = session_user_id(p_token);
  v_is_staff := found and (
    v_user.role = 'admin' or (v_user.role = 'store' and v_user.store_id = v_order.store_id)
  );
  if not v_is_staff and (
    v_user.user_id is null or v_user.role <> 'customer' or v_user.user_id <> v_order.customer_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'cannot_cancel');
  end if;
  if not v_is_staff and v_order.status not in ('pending', 'accepted') then
    return jsonb_build_object('ok', false, 'code', 'cannot_cancel');
  end if;

  update orders set status = 'cancelled', updated_at = now()
  where order_id = p_order_id returning * into v_order;
  if v_is_staff then
    insert into notifications(role, user_id, store_id, order_id, key, vars)
    values ('customer', v_order.customer_id, v_order.store_id, v_order.order_id,
            'notice_cancel', jsonb_build_object('id', v_order.order_id));
  else
    insert into notifications(role, store_id, order_id, key, vars)
    values ('store', v_order.store_id, v_order.order_id, 'notice_cancel',
            jsonb_build_object('id', v_order.order_id, 'name', v_order.customer_name));
  end if;
  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order));
end
$$;

create or replace function public.create_store(
  p_token text, p_store_name text, p_description text, p_open_time time,
  p_close_time time, p_image text, p_username text, p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin app_users%rowtype;
  v_store stores%rowtype;
  v_user_id text := 'user_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
begin
  select * into v_admin from app_users where user_id = session_user_id(p_token);
  if not found or v_admin.role <> 'admin' then return jsonb_build_object('ok', false, 'code', 'not_admin'); end if;
  if length(trim(coalesce(p_store_name, ''))) = 0 then return jsonb_build_object('ok', false, 'code', 'need_store_name'); end if;
  if length(trim(coalesce(p_username, ''))) = 0 or length(coalesce(p_password, '')) < 4 then
    return jsonb_build_object('ok', false, 'code', 'password_too_short');
  end if;
  if exists(select 1 from accounts where username = trim(p_username)) then
    return jsonb_build_object('ok', false, 'code', 'username_taken');
  end if;
  insert into stores(store_name, description, open_time, close_time, image)
  values (trim(p_store_name), coalesce(trim(p_description), ''), coalesce(p_open_time, '10:00'),
          coalesce(p_close_time, '20:00'), coalesce(nullif(trim(p_image), ''), '🏪'))
  returning * into v_store;
  insert into app_users(user_id, name, role, store_id)
  values (v_user_id, v_store.store_name, 'store', v_store.store_id);
  insert into accounts(username, password, user_id)
  values (trim(p_username), p_password, v_user_id);
  return jsonb_build_object('ok', true, 'store', to_jsonb(v_store), 'username', trim(p_username));
end
$$;

create or replace function public.update_store(
  p_token text, p_store_id text, p_store_name text, p_description text,
  p_open_time time, p_close_time time, p_status text, p_image text
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
  if not found or v_admin.role <> 'admin' then return jsonb_build_object('ok', false, 'code', 'not_admin'); end if;
  if length(trim(coalesce(p_store_name, ''))) = 0 then return jsonb_build_object('ok', false, 'code', 'need_store_name'); end if;
  update stores set
    store_name = trim(p_store_name),
    description = coalesce(trim(p_description), ''),
    open_time = coalesce(p_open_time, open_time),
    close_time = coalesce(p_close_time, close_time),
    status = case when p_status in ('open', 'closed') then p_status else status end,
    image = coalesce(nullif(trim(p_image), ''), image)
  where store_id = p_store_id returning * into v_store;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_store'); end if;
  update app_users set name = v_store.store_name where store_id = p_store_id and role = 'store';
  return jsonb_build_object('ok', true, 'store', to_jsonb(v_store));
end
$$;

create or replace function public.delete_store(p_token text, p_store_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_role text;
begin
  select role into v_role from app_users where user_id = session_user_id(p_token);
  if coalesce(v_role, '') <> 'admin' then return jsonb_build_object('ok', false, 'code', 'not_admin'); end if;
  delete from password_resets where store_id = p_store_id;
  delete from notifications where store_id = p_store_id;
  delete from stores where store_id = p_store_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_store'); end if;
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.mutate_product(
  p_token text, p_action text, p_product_id text, p_store_id text,
  p_product_name text, p_category text, p_description text,
  p_price numeric, p_image text, p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user app_users%rowtype;
  v_product products%rowtype;
  v_target_store text;
begin
  select * into v_user from app_users where user_id = session_user_id(p_token);
  if not found or v_user.role not in ('admin', 'store') then
    return jsonb_build_object('ok', false, 'code', 'not_admin');
  end if;
  if p_action = 'create' then
    v_target_store := case when v_user.role = 'store' then v_user.store_id else p_store_id end;
    if not exists(select 1 from stores where store_id = v_target_store) then
      return jsonb_build_object('ok', false, 'code', 'no_store');
    end if;
    if length(trim(coalesce(p_product_name, ''))) = 0 then
      return jsonb_build_object('ok', false, 'code', 'need_product_name');
    end if;
    if p_price is null or p_price < 0 then return jsonb_build_object('ok', false, 'code', 'invalid_price'); end if;
    insert into products(store_id, product_name, category, description, price, image, status)
    values (
      v_target_store, trim(p_product_name), coalesce(nullif(trim(p_category), ''), '—'),
      coalesce(trim(p_description), ''), p_price, coalesce(nullif(trim(p_image), ''), '🍽️'),
      case when p_status = 'soldout' then 'soldout' else 'active' end
    ) returning * into v_product;
  elsif p_action in ('update', 'delete') then
    select * into v_product from products where product_id = p_product_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'no_product'); end if;
    if v_user.role = 'store' and v_product.store_id <> v_user.store_id then
      return jsonb_build_object('ok', false, 'code', 'not_admin');
    end if;
    if p_action = 'delete' then
      delete from products where product_id = p_product_id;
      return jsonb_build_object('ok', true);
    end if;
    if length(trim(coalesce(p_product_name, ''))) = 0 then
      return jsonb_build_object('ok', false, 'code', 'need_product_name');
    end if;
    if p_price is null or p_price < 0 then return jsonb_build_object('ok', false, 'code', 'invalid_price'); end if;
    update products set
      product_name = trim(p_product_name),
      category = coalesce(nullif(trim(p_category), ''), '—'),
      description = coalesce(trim(p_description), ''),
      price = p_price,
      image = coalesce(nullif(trim(p_image), ''), image),
      status = case when p_status in ('active', 'soldout') then p_status else status end
    where product_id = p_product_id returning * into v_product;
  else
    return jsonb_build_object('ok', false, 'code', 'invalid_action');
  end if;
  return jsonb_build_object('ok', true, 'product', to_jsonb(v_product));
end
$$;

create or replace function public.get_customer_orders(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user app_users%rowtype;
  v_result jsonb;
begin
  select * into v_user from app_users where user_id = session_user_id(p_token);
  if not found or v_user.role <> 'customer' then return '[]'::jsonb; end if;
  select coalesce(
    jsonb_agg(
      to_jsonb(o) || jsonb_build_object(
        'items', coalesce(
          (select jsonb_agg(to_jsonb(i) order by i.order_item_id)
           from order_items i where i.order_id = o.order_id),
          '[]'::jsonb
        )
      )
      order by o.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from orders o
  where o.customer_id = v_user.user_id;
  return v_result;
end
$$;

create or replace function public.get_notifications(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user app_users%rowtype;
  v_result jsonb;
begin
  select * into v_user from app_users where user_id = session_user_id(p_token);
  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc), '[]'::jsonb)
  into v_result
  from notifications n
  where (v_user.user_id is not null and v_user.role = 'admin' and n.role = 'admin')
     or (v_user.user_id is not null and v_user.role = 'store' and n.role = 'store' and n.store_id = v_user.store_id)
     or (v_user.user_id is not null and v_user.role = 'customer'
         and n.role = 'customer' and n.user_id = v_user.user_id);
  return v_result;
end
$$;

create or replace function public.mark_notification_read(p_token text, p_notification_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user app_users%rowtype;
begin
  select * into v_user from app_users where user_id = session_user_id(p_token);
  update notifications n set read = true
  where n.notification_id = p_notification_id
    and (
      (v_user.user_id is not null and v_user.role = 'admin' and n.role = 'admin')
      or (v_user.user_id is not null and v_user.role = 'store' and n.role = 'store' and n.store_id = v_user.store_id)
      or (v_user.user_id is not null and v_user.role = 'customer'
          and n.role = 'customer' and n.user_id = v_user.user_id)
    );
  return jsonb_build_object('ok', found);
end
$$;

create or replace function public.request_password_reset(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user app_users%rowtype;
begin
  select u.* into v_user from accounts a join app_users u on u.user_id = a.user_id
  where a.username = trim(p_username) and u.role = 'store';
  if not found then return jsonb_build_object('ok', false, 'code', 'forgot_unknown'); end if;
  insert into password_resets(username, user_id, store_id)
  values (trim(p_username), v_user.user_id, v_user.store_id);
  insert into notifications(role, key, vars)
  values ('admin', 'notice_reset', jsonb_build_object('user', trim(p_username), 'id', v_user.store_id));
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.get_password_resets(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_role text; v_result jsonb;
begin
  select role into v_role from app_users where user_id = session_user_id(p_token);
  if coalesce(v_role, '') <> 'admin' then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
  into v_result from password_resets r where not r.done;
  return v_result;
end
$$;

create or replace function public.reset_store_password(p_token text, p_store_id text, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_role text; v_username text;
begin
  select role into v_role from app_users where user_id = session_user_id(p_token);
  if coalesce(v_role, '') <> 'admin' then return jsonb_build_object('ok', false, 'code', 'not_admin'); end if;
  if length(coalesce(p_new_password, '')) < 4 then
    return jsonb_build_object('ok', false, 'code', 'password_too_short');
  end if;
  update accounts a set password = p_new_password
  from app_users u
  where a.user_id = u.user_id and u.role = 'store' and u.store_id = p_store_id
  returning a.username into v_username;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_store'); end if;
  update password_resets set done = true where store_id = p_store_id;
  insert into notifications(role, store_id, key) values ('store', p_store_id, 'pw_reset_ok');
  return jsonb_build_object('ok', true, 'username', v_username);
end
$$;

create or replace function public.get_admin_users(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_role text; v_result jsonb;
begin
  select role into v_role from app_users where user_id = session_user_id(p_token);
  if coalesce(v_role, '') <> 'admin' then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(u) order by u.created_at desc), '[]'::jsonb)
  into v_result from app_users u;
  return v_result;
end
$$;

create or replace function public.get_admin_reviews(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_role text; v_result jsonb;
begin
  select role into v_role from app_users where user_id = session_user_id(p_token);
  if coalesce(v_role, '') <> 'admin' then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
  into v_result from reviews r;
  return v_result;
end
$$;

create or replace function public.get_admin_stats(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_top_store record;
  v_top_product record;
  v_peak record;
begin
  select role into v_role from app_users where user_id = session_user_id(p_token);
  if coalesce(v_role, '') <> 'admin' then return null; end if;
  select store_id, count(*) n into v_top_store from orders group by store_id order by n desc limit 1;
  select product_name, sum(quantity) n into v_top_product from order_items group by product_name order by n desc limit 1;
  select extract(hour from created_at at time zone 'Asia/Taipei')::integer h, count(*) n
  into v_peak from orders group by h order by n desc limit 1;
  return jsonb_build_object(
    'stores', (select count(*) from stores),
    'products', (select count(*) from products),
    'orders', (select count(*) from orders),
    'today', (select count(*) from orders where (created_at at time zone 'Asia/Taipei')::date =
      (now() at time zone 'Asia/Taipei')::date),
    'revenue', coalesce((select sum(total) from orders where status not in ('rejected', 'cancelled')), 0),
    'topStoreId', coalesce(v_top_store.store_id, ''),
    'topStoreN', coalesce(v_top_store.n, 0),
    'topProduct', coalesce(v_top_product.product_name, ''),
    'peakHour', v_peak.h
  );
end
$$;

revoke execute on function public.session_user_id(text) from public, anon;
revoke execute on function public.demo_login(text, text) from public;
revoke execute on function public.create_guest_session(text) from public;
revoke execute on function public.demo_logout(text) from public;
revoke execute on function public.create_order(text, text, text, timestamptz, text, jsonb) from public;
revoke execute on function public.update_order_status(text, text, text) from public;
revoke execute on function public.cancel_order(text, text) from public;
revoke execute on function public.create_store(text, text, text, time, time, text, text, text) from public;
revoke execute on function public.update_store(text, text, text, text, time, time, text, text) from public;
revoke execute on function public.delete_store(text, text) from public;
revoke execute on function public.mutate_product(text, text, text, text, text, text, text, numeric, text, text) from public;
revoke execute on function public.get_customer_orders(text) from public;
revoke execute on function public.get_notifications(text) from public;
revoke execute on function public.mark_notification_read(text, text) from public;
revoke execute on function public.request_password_reset(text) from public;
revoke execute on function public.get_password_resets(text) from public;
revoke execute on function public.reset_store_password(text, text, text) from public;
revoke execute on function public.get_admin_users(text) from public;
revoke execute on function public.get_admin_reviews(text) from public;
revoke execute on function public.get_admin_stats(text) from public;

grant execute on function public.demo_login(text, text) to anon;
grant execute on function public.create_guest_session(text) to anon;
grant execute on function public.demo_logout(text) to anon;
grant execute on function public.create_order(text, text, text, timestamptz, text, jsonb) to anon;
grant execute on function public.update_order_status(text, text, text) to anon;
grant execute on function public.cancel_order(text, text) to anon;
grant execute on function public.create_store(text, text, text, time, time, text, text, text) to anon;
grant execute on function public.update_store(text, text, text, text, time, time, text, text) to anon;
grant execute on function public.delete_store(text, text) to anon;
grant execute on function public.mutate_product(text, text, text, text, text, text, text, numeric, text, text) to anon;
grant execute on function public.get_customer_orders(text) to anon;
grant execute on function public.get_notifications(text) to anon;
grant execute on function public.mark_notification_read(text, text) to anon;
grant execute on function public.request_password_reset(text) to anon;
grant execute on function public.get_password_resets(text) to anon;
grant execute on function public.reset_store_password(text, text, text) to anon;
grant execute on function public.get_admin_users(text) to anon;
grant execute on function public.get_admin_reviews(text) to anon;
grant execute on function public.get_admin_stats(text) to anon;

insert into public.app_users(user_id, name, role, status)
values
  ('user_c001', '學生小明', 'customer', 'active'),
  ('user_admin', '校園管理團隊', 'admin', 'active')
on conflict (user_id) do nothing;

insert into public.accounts(username, password, user_id)
values
  ('student', '1234', 'user_c001'),
  ('admin', '1234', 'user_admin')
on conflict (username) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then null;
end
$$;
