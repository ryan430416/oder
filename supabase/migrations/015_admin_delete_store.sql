-- Admin can hard-delete a store: detach logins, remove orders/products, then store.
-- Also purge the two leftover disabled shops that still have order history.

create or replace function public.admin_delete_store(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores%rowtype;
  v_orders int := 0;
  v_products int := 0;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'not_admin');
  end if;

  select * into v_store from public.stores where id = p_store_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_store');
  end if;

  -- Store accounts must change role before store_id can be cleared (profiles_check).
  update public.profiles
  set role = 'customer',
      status = 'disabled',
      store_id = null
  where store_id = p_store_id;

  -- Orders block store delete (ON DELETE RESTRICT); remove them first.
  -- order_items / reviews / notifications cascade from orders.
  delete from public.orders where store_id = p_store_id;
  get diagnostics v_orders = row_count;

  delete from public.products where store_id = p_store_id;
  get diagnostics v_products = row_count;

  delete from public.stores where id = p_store_id;

  return jsonb_build_object(
    'ok', true,
    'deleted', true,
    'orders', v_orders,
    'products', v_products
  );
end
$$;

revoke execute on function public.admin_delete_store(uuid) from public;
grant execute on function public.admin_delete_store(uuid) to authenticated;

-- One-shot purge (SQL Editor runs as postgres — cannot use is_admin() RPC path)
do $$
declare
  ids uuid[] := array[
    'd43ebbdb-0af1-4e99-84c4-35fcb015302e'::uuid, -- ร้านค้า
    '25657357-853a-42a3-9571-24a6582dccdd'::uuid  -- ร้าน แม่กิ๊ก M’Gik
  ];
begin
  update public.profiles
  set role = 'customer',
      status = 'disabled',
      store_id = null
  where store_id = any (ids);

  delete from public.orders where store_id = any (ids);
  delete from public.products where store_id = any (ids);
  delete from public.stores where id = any (ids);
end
$$;

-- Remaining open shops (students)
select id, name, status
from public.stores
order by created_at;
