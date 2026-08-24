-- Apply this migration once to an existing Supabase project.
alter table public.stock_history drop constraint if exists stock_history_reason_check;
alter table public.stock_history add constraint stock_history_reason_check
  check (reason in ('order_created', 'order_edited', 'order_deleted', 'restock', 'bulk_update', 'stock_entry', 'po_received'));

create table if not exists public.stock_entries (
  id uuid default uuid_generate_v4() primary key,
  reference_number serial unique not null,
  created_by uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create table if not exists public.stock_entry_items (
  id uuid default uuid_generate_v4() primary key,
  stock_entry_id uuid references public.stock_entries(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete restrict not null,
  quantity integer not null check (quantity > 0),
  cost_price numeric(12,2) check (cost_price >= 0)
);
create table if not exists public.suppliers (
  id uuid default uuid_generate_v4() primary key,
  name text not null, contact_person text, mobile text, email text, address text, notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.stock_entries
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create table if not exists public.purchase_orders (
  id uuid default uuid_generate_v4() primary key,
  po_number serial unique not null,
  supplier_id uuid references public.suppliers(id) on delete restrict not null,
  status text not null check (status in ('draft', 'ordered', 'received', 'partial')),
  created_by uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create table if not exists public.purchase_order_items (
  id uuid default uuid_generate_v4() primary key,
  purchase_order_id uuid references public.purchase_orders(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete restrict not null,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0 and quantity_received <= quantity_ordered),
  unit_cost numeric(12,2) not null check (unit_cost >= 0)
);

alter table public.stock_entries enable row level security;
alter table public.stock_entry_items enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists "Authenticated stock entries" on public.stock_entries;
drop policy if exists "Authenticated stock entry items" on public.stock_entry_items;
drop policy if exists "Authenticated suppliers" on public.suppliers;
drop policy if exists "Authenticated purchase orders" on public.purchase_orders;
drop policy if exists "Authenticated purchase order items" on public.purchase_order_items;
create policy "Authenticated stock entries" on public.stock_entries for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated stock entry items" on public.stock_entry_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated suppliers" on public.suppliers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated purchase orders" on public.purchase_orders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated purchase order items" on public.purchase_order_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
