-- One-time bridge from the legacy custom-session schema.
-- Existing data is archived, not deleted. Run supabase/schema.sql immediately after this file.

drop policy if exists "test upload product images" on storage.objects;
drop policy if exists "test update product images" on storage.objects;
drop policy if exists "test delete product images" on storage.objects;

drop function if exists public.session_user_id(text) cascade;
drop function if exists public.demo_login(text, text) cascade;
drop function if exists public.create_guest_session(text) cascade;
drop function if exists public.demo_logout(text) cascade;
drop function if exists public.create_order(text, text, text, timestamptz, text, jsonb) cascade;
drop function if exists public.update_order_status(text, text, text) cascade;
drop function if exists public.cancel_order(text, text) cascade;
drop function if exists public.create_store(text, text, text, time, time, text, text, text) cascade;
drop function if exists public.update_store(text, text, text, text, time, time, text, text) cascade;
drop function if exists public.delete_store(text, text) cascade;
drop function if exists public.set_store_service_periods(text, text, text[]) cascade;
drop function if exists public.mutate_product(text, text, text, text, text, text, text, numeric, text, text) cascade;
drop function if exists public.get_customer_orders(text) cascade;
drop function if exists public.get_notifications(text) cascade;
drop function if exists public.mark_notification_read(text, text) cascade;
drop function if exists public.request_password_reset(text) cascade;
drop function if exists public.get_password_resets(text) cascade;
drop function if exists public.reset_store_password(text, text, text) cascade;
drop function if exists public.get_admin_users(text) cascade;
drop function if exists public.get_admin_reviews(text) cascade;
drop function if exists public.get_admin_stats(text) cascade;
drop function if exists public.delete_user_account(text, text) cascade;
drop function if exists public.update_customer_profile(text, text, text) cascade;
drop function if exists public.copy_order_customer_grade() cascade;
drop function if exists public.validate_order_service_period() cascade;
drop function if exists public.is_service_pickup_time(text[], time) cascade;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'stores' and column_name = 'store_id'
  ) then
    alter table public.stores rename to legacy_stores_v1;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'product_id'
  ) then
    alter table public.products rename to legacy_products_v1;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'order_id'
  ) then
    alter table public.orders rename to legacy_orders_v1;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_items' and column_name = 'order_item_id'
  ) then
    alter table public.order_items rename to legacy_order_items_v1;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'notification_id'
  ) then
    alter table public.notifications rename to legacy_notifications_v1;
  end if;
  if to_regclass('public.app_users') is not null then
    alter table public.app_users rename to legacy_app_users_v1;
  end if;
  if to_regclass('public.accounts') is not null then
    alter table public.accounts rename to legacy_accounts_v1;
  end if;
  if to_regclass('public.demo_sessions') is not null then
    alter table public.demo_sessions rename to legacy_demo_sessions_v1;
  end if;
  if to_regclass('public.reviews') is not null then
    alter table public.reviews rename to legacy_reviews_v1;
  end if;
  if to_regclass('public.password_resets') is not null then
    alter table public.password_resets rename to legacy_password_resets_v1;
  end if;
end
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'legacy_stores_v1',
    'legacy_products_v1',
    'legacy_orders_v1',
    'legacy_order_items_v1',
    'legacy_notifications_v1',
    'legacy_app_users_v1',
    'legacy_accounts_v1',
    'legacy_demo_sessions_v1',
    'legacy_reviews_v1',
    'legacy_password_resets_v1'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', v_table);
    end if;
  end loop;
end
$$;
