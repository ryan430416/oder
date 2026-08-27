alter table public.app_users add column if not exists grade text not null default '';
alter table public.orders add column if not exists customer_grade text not null default '';

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
  if length(trim(coalesce(p_grade, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'need_grade');
  end if;
  update app_users
  set name = trim(p_name), grade = trim(p_grade)
  where user_id = v_user.user_id
  returning * into v_user;
  return jsonb_build_object('ok', true, 'user', to_jsonb(v_user));
end
$$;

create or replace function public.copy_order_customer_grade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select grade into new.customer_grade
  from app_users
  where user_id = new.customer_id;
  new.customer_grade := coalesce(new.customer_grade, '');
  return new;
end
$$;

drop trigger if exists orders_copy_customer_grade on public.orders;
create trigger orders_copy_customer_grade
before insert on public.orders
for each row execute function public.copy_order_customer_grade();

update public.orders
set status = 'pending', updated_at = now()
where status in ('accepted', 'preparing');

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
    (v_order.status = 'pending' and p_next_status in ('ready', 'rejected'))
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

revoke execute on function public.update_customer_profile(text, text, text) from public;
grant execute on function public.update_customer_profile(text, text, text) to anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "test upload product images" on storage.objects;
create policy "test upload product images"
on storage.objects for insert to anon
with check (bucket_id = 'product-images');

drop policy if exists "test update product images" on storage.objects;
create policy "test update product images"
on storage.objects for update to anon
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');

drop policy if exists "test delete product images" on storage.objects;
create policy "test delete product images"
on storage.objects for delete to anon
using (bucket_id = 'product-images');
