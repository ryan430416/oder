-- Idempotent Storage setup for product-images.
-- Paste into the Supabase SQL Editor. Policies apply to authenticated store owners and admins only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  false,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

drop policy if exists "test upload product images" on storage.objects;
drop policy if exists "test update product images" on storage.objects;
drop policy if exists "test delete product images" on storage.objects;
drop policy if exists product_images_read_published on storage.objects;
drop policy if exists product_images_insert_owner on storage.objects;
drop policy if exists product_images_update_owner on storage.objects;
drop policy if exists product_images_delete_owner on storage.objects;

-- Read: admin, owning store, or published catalog items.
create policy product_images_read_published on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'product-images'
  and (
    public.is_admin()
    or (
      public.current_store_id() is not null
      and (storage.foldername(name))[1] = public.current_store_id()::text
    )
    or exists (
      select 1
      from public.products p
      join public.stores s on s.id = p.store_id
      where p.image_path = name
        and p.status in ('active', 'soldout')
        and s.status = 'open'
    )
  )
);

-- Write: authenticated store owner of first-folder UUID, or admin.
-- INSERT policies must use `name`, not storage.objects.name.
create policy product_images_insert_owner on storage.objects
for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (
    public.is_admin()
    or (
      public.current_store_id() is not null
      and (storage.foldername(name))[1] = public.current_store_id()::text
    )
  )
);

create policy product_images_update_owner on storage.objects
for update to authenticated
using (
  bucket_id = 'product-images'
  and (
    public.is_admin()
    or (
      public.current_store_id() is not null
      and (storage.foldername(name))[1] = public.current_store_id()::text
    )
  )
)
with check (
  bucket_id = 'product-images'
  and (
    public.is_admin()
    or (
      public.current_store_id() is not null
      and (storage.foldername(name))[1] = public.current_store_id()::text
    )
  )
);

create policy product_images_delete_owner on storage.objects
for delete to authenticated
using (
  bucket_id = 'product-images'
  and (
    public.is_admin()
    or (
      public.current_store_id() is not null
      and (storage.foldername(name))[1] = public.current_store_id()::text
    )
  )
);
