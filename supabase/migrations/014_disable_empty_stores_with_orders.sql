-- Finish cleanup: Pa’Gik + empty ร้านพี่เจน already deleted.
-- ร้านค้า + แม่กิ๊ก still remain — almost certainly because they have orders
-- (delete is blocked by safety). Hide them from students by disabling.

-- See why they were kept
select
  s.id,
  s.name,
  s.status,
  (select count(*) from public.products p where p.store_id = s.id) as products,
  (select count(*) from public.orders o where o.store_id = s.id) as orders
from public.stores s
where s.id in (
  'd43ebbdb-0af1-4e99-84c4-35fcb015302e', -- ร้านค้า
  '25657357-853a-42a3-9571-24a6582dccdd'  -- ร้าน แม่กิ๊ก M’Gik
);

-- Detach store logins (must change role before clearing store_id)
update public.profiles
set role = 'customer',
    status = 'disabled',
    store_id = null
where store_id in (
  'd43ebbdb-0af1-4e99-84c4-35fcb015302e',
  '25657357-853a-42a3-9571-24a6582dccdd'
);

-- Hide from customer list (status must not be open)
update public.stores
set status = 'disabled'
where id in (
  'd43ebbdb-0af1-4e99-84c4-35fcb015302e',
  '25657357-853a-42a3-9571-24a6582dccdd'
);

-- What students will see (open only)
select id, name, status
from public.stores
where status = 'open'
order by created_at;
