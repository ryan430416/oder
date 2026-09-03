-- Delete empty leftover stores only (0 products, 0 orders).
-- Fix: store profiles cannot have store_id=null (profiles_check),
-- so change them to disabled customers before unlinking / deleting shops.

-- 1) Detach empty-store logins without breaking profiles_check
update public.profiles
set role = 'customer',
    status = 'disabled',
    store_id = null,
    grade = coalesce(nullif(grade, ''), '')
where store_id in (
  'd43ebbdb-0af1-4e99-84c4-35fcb015302e', -- ร้านค้า (empty)
  '25657357-853a-42a3-9571-24a6582dccdd', -- ร้าน แม่กิ๊ก M’Gik (empty)
  'c67aa5ef-2f9e-49ad-8a94-08c567f6c4e3', -- Pa’Gik (empty)
  '7e1b289a-8053-4b48-8c8e-f45a546348a1'  -- ร้านพี่เจน empty duplicate
);

-- 2) Delete only if still empty
delete from public.stores s
where s.id in (
  'd43ebbdb-0af1-4e99-84c4-35fcb015302e',
  '25657357-853a-42a3-9571-24a6582dccdd',
  'c67aa5ef-2f9e-49ad-8a94-08c567f6c4e3',
  '7e1b289a-8053-4b48-8c8e-f45a546348a1'
)
and not exists (select 1 from public.products p where p.store_id = s.id)
and not exists (select 1 from public.orders o where o.store_id = s.id);

-- 3) What remains
select id, name, status
from public.stores
order by created_at;
