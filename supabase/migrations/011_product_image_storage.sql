-- Idempotent Storage setup for product-images.
-- Paste into the Supabase SQL Editor as a single run.
--
-- Do not run ALTER TABLE on storage.objects. Hosted Supabase owns that table
-- (role supabase_storage_admin). RLS is already enabled. ALTER TABLE causes:
-- ERROR 42501: must be owner of table objects

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

drop policy if exists "test upload product images" on storage.objects;
drop policy if exists "test update product images" on storage.objects;
drop policy if exists "test delete product images" on storage.objects;
drop policy if exists product_images_read_published on storage.objects;
drop policy if exists product_images_insert_owner on storage.objects;
drop policy if exists product_images_update_owner on storage.objects;
drop policy if exists product_images_delete_owner on storage.objects;

create policy product_images_read_published on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'product-images'
  and (
    public.is_admin()
    or (
      public.current_store_id() is not null
      and (storage.foldername(storage.objects.name))[1] = public.current_store_id()::text
    )
    or exists (
      select 1
      from public.products p
      join public.stores s on s.id = p.store_id
      where p.image_path = storage.objects.name
        and p.status in ('active', 'soldout')
        and s.status = 'open'
    )
  )
);

create policy product_images_insert_owner on storage.objects
for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (
    public.is_admin()
    or (
      public.current_store_id() is not null
      and (storage.foldername(storage.objects.name))[1] = public.current_store_id()::text
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
      and (storage.foldername(storage.objects.name))[1] = public.current_store_id()::text
    )
  )
)
with check (
  bucket_id = 'product-images'
  and (
    public.is_admin()
    or (
      public.current_store_id() is not null
      and (storage.foldername(storage.objects.name))[1] = public.current_store_id()::text
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
      and (storage.foldername(storage.objects.name))[1] = public.current_store_id()::text
    )
  )
);
