-- School pickup windows are fixed and not limited by a store's selected periods.

create or replace function public.is_service_pickup_time(p_periods text[], p_time time)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    p_time between '08:35'::time and '08:45'::time
    or p_time between '09:30'::time and '09:40'::time
    or p_time between '10:25'::time and '10:35'::time
    or p_time between '11:20'::time and '11:30'::time
    or p_time between '12:15'::time and '13:00'::time
    or p_time between '17:15'::time and '17:30'::time
    or p_time between '18:15'::time and '18:25'::time
$$;

revoke execute on function public.is_service_pickup_time(text[], time) from public;
