-- Postgres relational schema for Stock & Order Management App

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Users table (linked to auth.users in Supabase)
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  mobile text unique,
  email text unique,
  role text not null check (role in ('user', 'superadmin')),
  must_change_password boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for users
alter table public.users enable row level security;
create policy "Allow read access to all authenticated users" on public.users
  for select using (auth.role() = 'authenticated');
create policy "Allow write access to super admins" on public.users
  for all using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'superadmin'
    )
  );

-- 2. Categories table
create table public.categories (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique,
  description text,
  image_url text,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.categories enable row level security;
create policy "Allow read access to categories" on public.categories
  for select using (auth.role() = 'authenticated' and is_deleted = false);
create policy "Allow all actions for categories" on public.categories
  for all using (auth.role() = 'authenticated');

-- 3. Products table
create table public.products (
  id uuid default uuid_generate_v4() primary key,
  category_id uuid references public.categories(id) on delete restrict not null,
  name text not null,
  sku text unique not null,
  barcode text unique,
  cost_price numeric(12,2) not null check (cost_price >= 0),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  stock integer not null default 0 check (stock >= 0), -- Prevents negative stock database-side
  image_url text,
  description text,
  created_by uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone
);

alter table public.products enable row level security;
create policy "Allow read access to products" on public.products
  for select using (auth.role() = 'authenticated' and is_deleted = false);
create policy "Allow all actions for products" on public.products
  for all using (auth.role() = 'authenticated');

-- 4. Customers table
create table public.customers (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  company text,
  address text,
  mobile text unique not null,
  email text,
  nic text,
  bank_details jsonb, -- bank name, branch, account number, payee name
  notes text,
  balance numeric(12,2) default 0.00 not null, -- customer balance/outstanding ledger
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.customers enable row level security;
create policy "Allow read access to customers" on public.customers
  for select using (auth.role() = 'authenticated' and is_deleted = false);
create policy "Allow all actions for customers" on public.customers
  for all using (auth.role() = 'authenticated');

-- 5. Orders table
create table public.orders (
  id uuid default uuid_generate_v4() primary key,
  order_number serial unique not null, -- Autoincrementing ORD-000001 behavior will be handled in frontend format
  customer_id uuid references public.customers(id) on delete restrict not null,
  total numeric(12,2) not null default 0.00 check (total >= 0),
  paid_amount numeric(12,2) not null default 0.00 check (paid_amount >= 0),
  status text not null check (status in ('unpaid', 'partial', 'paid')),
  pack_status text not null default 'pending' check (pack_status in ('pending', 'packed', 'given_to_transport', 'received')),
  created_by uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  is_deleted boolean default false not null,
  deleted_at timestamp with time zone
);

alter table public.orders enable row level security;
create policy "Allow read access to orders" on public.orders
  for select using (auth.role() = 'authenticated' and is_deleted = false);
create policy "Allow all actions for orders" on public.orders
  for all using (auth.role() = 'authenticated');

-- 6. Order Items table
create table public.order_items (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete restrict not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0)
);

alter table public.order_items enable row level security;
create policy "Allow read access to order items" on public.order_items
  for select using (auth.role() = 'authenticated');
create policy "Allow all actions for order items" on public.order_items
  for all using (auth.role() = 'authenticated');

-- 7. Payments table
create table public.payments (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id) on delete cascade not null,
  amount numeric(12,2) not null check (amount > 0),
  recorded_by uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.payments enable row level security;
create policy "Allow read access to payments" on public.payments
  for select using (auth.role() = 'authenticated');
create policy "Allow all actions for payments" on public.payments
  for all using (auth.role() = 'authenticated');

-- 8. Stock History table
create table public.stock_history (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  change_amount integer not null,
  reason text not null check (reason in ('order_created', 'order_edited', 'order_deleted', 'restock', 'bulk_update', 'stock_entry', 'po_received')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.stock_history enable row level security;
create policy "Allow read access to stock history" on public.stock_history
  for select using (auth.role() = 'authenticated');
create policy "Allow write access for stock history" on public.stock_history
  for insert with check (auth.role() = 'authenticated');

-- Inventory receiving documents
create table public.stock_entries (
  id uuid default uuid_generate_v4() primary key,
  reference_number serial unique not null,
  created_by uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.stock_entry_items (
  id uuid default uuid_generate_v4() primary key,
  stock_entry_id uuid references public.stock_entries(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete restrict not null,
  quantity integer not null check (quantity > 0),
  cost_price numeric(12,2) check (cost_price >= 0)
);

create table public.suppliers (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  contact_person text,
  mobile text,
  email text,
  address text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.stock_entries
  add column supplier_id uuid references public.suppliers(id) on delete set null;

create table public.purchase_orders (
  id uuid default uuid_generate_v4() primary key,
  po_number serial unique not null,
  supplier_id uuid references public.suppliers(id) on delete restrict not null,
  status text not null check (status in ('draft', 'ordered', 'received', 'partial')),
  created_by uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.purchase_order_items (
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
create policy "Authenticated stock entries" on public.stock_entries for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated stock entry items" on public.stock_entry_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated suppliers" on public.suppliers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated purchase orders" on public.purchase_orders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated purchase order items" on public.purchase_order_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 9. Audit Logs table
create table public.audit_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  target_table text not null,
  target_id uuid not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.audit_logs enable row level security;
create policy "Allow read access to audit logs" on public.audit_logs
  for select using (auth.role() = 'authenticated');
create policy "Allow write access to audit logs" on public.audit_logs
  for insert with check (auth.role() = 'authenticated');

-- FIFO costing, transport details, and partial returns are installed below by the
-- same idempotent migration used for existing projects.

-- 10. WebAuthn Credentials table
create table public.webauthn_credentials (
  id text primary key, -- Credential ID from WebAuthn API
  user_id uuid references public.users(id) on delete cascade not null,
  public_key text not null, -- Public key in base64/hex/COSE
  counter integer default 0 not null,
  device_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.webauthn_credentials enable row level security;
create policy "Allow read/write of own credentials" on public.webauthn_credentials
  for all using (user_id = auth.uid());


-- VIEWS FOR RECYCLE BIN (SOFT DELETE ACCESSIBILITY)

create or replace view public.deleted_orders as
  select * from public.orders where is_deleted = true;

create or replace view public.deleted_products as
  select * from public.products where is_deleted = true;

create or replace view public.deleted_customers as
  select * from public.customers where is_deleted = true;


-- DATABASE TRIGGERS FOR BUSINESS RULES

-- A. Auto-create profile in public.users when auth.users is created
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, name, mobile, email, role, must_change_password)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'mobile',
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'user'),
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, true)
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- B. Stock adjustment triggers on order item creation, modification, deletion
create or replace function public.handle_order_item_stock_change()
returns trigger as $$
declare
  qty_diff integer;
begin
  if (tg_op = 'INSERT') then
    -- Reduce product stock
    update public.products
    set stock = stock - new.quantity
    where id = new.product_id;

    -- Log stock history
    insert into public.stock_history(product_id, change_amount, reason)
    values (new.product_id, -new.quantity, 'order_created');

  elsif (tg_op = 'UPDATE') then
    qty_diff := new.quantity - old.quantity;
    
    if (qty_diff <> 0) then
      -- Adjust stock
      update public.products
      set stock = stock - qty_diff
      where id = new.product_id;

      -- Log stock history
      insert into public.stock_history(product_id, change_amount, reason)
      values (new.product_id, -qty_diff, 'order_edited');
    end if;

  elsif (tg_op = 'DELETE') then
    -- Restore stock
    update public.products
    set stock = stock + old.quantity
    where id = old.product_id;

    -- Log stock history
    insert into public.stock_history(product_id, change_amount, reason)
    values (old.product_id, old.quantity, 'order_deleted');
  end if;
  return null;
end;
$$ language plpgsql security definer;

create or replace trigger trigger_order_item_stock
  after insert or update or delete on public.order_items
  for each row execute procedure public.handle_order_item_stock_change();


-- C. Restore stock on soft-deleting an entire order / decrement on restore
create or replace function public.handle_order_soft_delete()
returns trigger as $$
declare
  item record;
begin
  -- Order is soft deleted: is_deleted changed from false to true
  if (new.is_deleted = true and old.is_deleted = false) then
    for item in select product_id, quantity from public.order_items where order_id = new.id loop
      -- Increment product stock
      update public.products
      set stock = stock + item.quantity
      where id = item.product_id;

      -- Log stock history
      insert into public.stock_history(product_id, change_amount, reason)
      values (item.product_id, item.quantity, 'order_deleted');
    end loop;

    -- Reduce customer balance by order total (outstanding balance goes down)
    update public.customers
    set balance = balance - (new.total - new.paid_amount)
    where id = new.customer_id;

  -- Order is restored: is_deleted changed from true to false
  elsif (new.is_deleted = false and old.is_deleted = true) then
    for item in select product_id, quantity from public.order_items where order_id = new.id loop
      -- Decrement product stock (database check stock >= 0 constraint will raise error if insufficient)
      update public.products
      set stock = stock - item.quantity
      where id = item.product_id;

      -- Log stock history
      insert into public.stock_history(product_id, change_amount, reason)
      values (item.product_id, -item.quantity, 'order_created');
    end loop;

    -- Add back to customer balance (outstanding balance goes up)
    update public.customers
    set balance = balance + (new.total - new.paid_amount)
    where id = new.customer_id;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create or replace trigger trigger_order_soft_delete
  after update on public.orders
  for each row execute procedure public.handle_order_soft_delete();


-- D. Manage customer balance on Order Creation / Order Modification
create or replace function public.handle_order_balance_impact()
returns trigger as $$
declare
  balance_diff numeric(12,2);
begin
  if (tg_op = 'INSERT') then
    -- Add the unpaid portion to customer balance
    update public.customers
    set balance = balance + (new.total - new.paid_amount)
    where id = new.customer_id;

  elsif (tg_op = 'UPDATE') then
    -- If it's a soft-delete, it's already handled in trigger_order_soft_delete
    if (new.is_deleted = old.is_deleted) then
      balance_diff := (new.total - new.paid_amount) - (old.total - old.paid_amount);
      if (balance_diff <> 0) then
        update public.customers
        set balance = balance + balance_diff
        where id = new.customer_id;
      end if;
    end if;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create or replace trigger trigger_order_balance
  after insert or update on public.orders
  for each row execute procedure public.handle_order_balance_impact();


-- E. Update order status and paid amount when a payment is logged
create or replace function public.handle_payment_recorded()
returns trigger as $$
begin
  -- Increase the paid amount in the order
  update public.orders
  set paid_amount = paid_amount + new.amount,
      status = case 
                 when paid_amount + new.amount >= total then 'paid'
                 when paid_amount + new.amount > 0 then 'partial'
                 else 'unpaid'
               end
  where id = new.order_id;

  return new;
end;
$$ language plpgsql security definer;

create or replace trigger trigger_payment_recorded
  after insert on public.payments
  for each row execute procedure public.handle_payment_recorded();
