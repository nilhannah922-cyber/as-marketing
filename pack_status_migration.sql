-- Apply once to an existing Supabase project.
alter table public.orders
  add column if not exists pack_status text not null default 'pending';
alter table public.orders drop constraint if exists orders_pack_status_check;
alter table public.orders add constraint orders_pack_status_check
  check (pack_status in ('pending', 'packed', 'given_to_transport', 'received'));
