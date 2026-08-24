-- FIFO costing, transport details, and partial order returns.
-- Run once on existing Supabase projects. New projects receive the same definitions in schema.sql.

alter table public.orders add column if not exists transport_name text;
alter table public.orders add column if not exists has_returns boolean not null default false;
alter table public.orders add column if not exists return_credit_amount numeric(12,2) not null default 0 check (return_credit_amount >= 0);
alter table public.order_items add column if not exists returned_quantity integer not null default 0
  check (returned_quantity >= 0 and returned_quantity <= quantity);
alter table public.customers add column if not exists credit_balance numeric(12,2) not null default 0 check (credit_balance >= 0);

create table if not exists public.refunds (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid references public.orders(id) on delete cascade not null,
  amount numeric(12,2) not null check (amount > 0),
  method text not null,
  recorded_by uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.refunds enable row level security;
drop policy if exists "Authenticated refunds" on public.refunds;
create policy "Authenticated refunds" on public.refunds for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table public.stock_history drop constraint if exists stock_history_reason_check;
alter table public.stock_history add constraint stock_history_reason_check
  check (reason in ('order_created','order_edited','order_deleted','order_return','restock','bulk_update','stock_entry','po_received'));

create table if not exists public.stock_batches (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid references public.products(id) on delete cascade not null,
  quantity_remaining integer not null check (quantity_remaining >= 0),
  cost_price numeric(12,2) not null check (cost_price >= 0),
  source text not null check (source in ('initial','restock','bulk_update','stock_entry','po_received')),
  source_reference uuid,
  received_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.order_item_batch_usage (
  id uuid default uuid_generate_v4() primary key,
  order_item_id uuid references public.order_items(id) on delete cascade not null,
  stock_batch_id uuid references public.stock_batches(id) on delete restrict not null,
  quantity integer not null check (quantity > 0),
  returned_quantity integer not null default 0 check (returned_quantity >= 0 and returned_quantity <= quantity),
  cost_price_at_time numeric(12,2) not null check (cost_price_at_time >= 0)
);

alter table public.stock_batches enable row level security;
alter table public.order_item_batch_usage enable row level security;
drop policy if exists "Authenticated stock batches" on public.stock_batches;
create policy "Authenticated stock batches" on public.stock_batches for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated batch usage" on public.order_item_batch_usage;
create policy "Authenticated batch usage" on public.order_item_batch_usage for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create index if not exists stock_batches_fifo_idx
  on public.stock_batches(product_id, received_at, id) where quantity_remaining > 0;
create index if not exists order_item_batch_usage_item_idx
  on public.order_item_batch_usage(order_item_id);

-- Backfill one opening batch for stock that predates this migration.
insert into public.stock_batches(product_id, quantity_remaining, cost_price, source, received_at)
select p.id, p.stock, p.cost_price, 'initial', p.created_at
from public.products p
where p.stock > 0
  and not exists (select 1 from public.stock_batches b where b.product_id = p.id);

create or replace function public.consume_fifo(p_order_item_id uuid, p_product_id uuid, p_quantity integer)
returns void as $$
declare
  remaining integer := p_quantity;
  batch record;
  used integer;
begin
  for batch in
    select id, quantity_remaining, cost_price
    from public.stock_batches
    where product_id = p_product_id and quantity_remaining > 0
    order by received_at, id
    for update
  loop
    exit when remaining = 0;
    used := least(remaining, batch.quantity_remaining);
    update public.stock_batches set quantity_remaining = quantity_remaining - used where id = batch.id;
    insert into public.order_item_batch_usage(order_item_id, stock_batch_id, quantity, cost_price_at_time)
    values (p_order_item_id, batch.id, used, batch.cost_price);
    remaining := remaining - used;
  end loop;
  if remaining > 0 then
    raise exception 'Insufficient FIFO batch stock for product % (short by %)', p_product_id, remaining;
  end if;
end;
$$ language plpgsql security definer;

create or replace function public.restore_fifo(p_order_item_id uuid, p_quantity integer)
returns void as $$
declare
  remaining integer := p_quantity;
  usage record;
  restored integer;
begin
  for usage in
    select id, stock_batch_id, quantity, returned_quantity
    from public.order_item_batch_usage
    where order_item_id = p_order_item_id and returned_quantity < quantity
    order by id desc
    for update
  loop
    exit when remaining = 0;
    restored := least(remaining, usage.quantity - usage.returned_quantity);
    update public.order_item_batch_usage set returned_quantity = returned_quantity + restored where id = usage.id;
    update public.stock_batches set quantity_remaining = quantity_remaining + restored where id = usage.stock_batch_id;
    remaining := remaining - restored;
  end loop;
  if remaining > 0 then
    raise exception 'Cannot restore % units: only % FIFO usage units are available', p_quantity, p_quantity - remaining;
  end if;
end;
$$ language plpgsql security definer;

create or replace function public.consume_stock_adjustment_fifo(p_product_id uuid, p_quantity integer)
returns void as $$
declare remaining integer := p_quantity; batch record; used integer;
begin
  for batch in select id, quantity_remaining from public.stock_batches where product_id = p_product_id and quantity_remaining > 0 order by received_at, id for update loop
    exit when remaining = 0;
    used := least(remaining, batch.quantity_remaining);
    update public.stock_batches set quantity_remaining = quantity_remaining - used where id = batch.id;
    remaining := remaining - used;
  end loop;
  if remaining > 0 then raise exception 'Insufficient FIFO batch stock'; end if;
end;
$$ language plpgsql security definer;

create or replace function public.handle_order_item_stock_change()
returns trigger as $$
declare qty_diff integer;
begin
  if tg_op = 'INSERT' then
    perform public.consume_fifo(new.id, new.product_id, new.quantity);
    update public.products set stock = stock - new.quantity where id = new.product_id;
    insert into public.stock_history(product_id, change_amount, reason) values (new.product_id, -new.quantity, 'order_created');
  elsif tg_op = 'UPDATE' then
    qty_diff := new.quantity - old.quantity;
    if qty_diff > 0 then
      perform public.consume_fifo(new.id, new.product_id, qty_diff);
    elsif qty_diff < 0 then
      perform public.restore_fifo(new.id, -qty_diff);
    end if;
    if qty_diff <> 0 then
      update public.products set stock = stock - qty_diff where id = new.product_id;
      insert into public.stock_history(product_id, change_amount, reason) values (new.product_id, -qty_diff, 'order_edited');
    end if;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create or replace function public.handle_order_item_before_delete()
returns trigger as $$
begin
  perform public.restore_fifo(old.id, old.quantity - old.returned_quantity);
  update public.products set stock = stock + old.quantity - old.returned_quantity where id = old.product_id;
  insert into public.stock_history(product_id, change_amount, reason) values (old.product_id, old.quantity - old.returned_quantity, 'order_deleted');
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trigger_order_item_stock on public.order_items;
create trigger trigger_order_item_stock
  after insert or update on public.order_items
  for each row execute procedure public.handle_order_item_stock_change();
drop trigger if exists trigger_order_item_before_delete on public.order_items;
create trigger trigger_order_item_before_delete
  before delete on public.order_items
  for each row execute procedure public.handle_order_item_before_delete();

create or replace function public.handle_order_soft_delete()
returns trigger as $$
declare item record;
begin
  if new.is_deleted = true and old.is_deleted = false then
    for item in select id, product_id, quantity, returned_quantity from public.order_items where order_id = new.id loop
      perform public.restore_fifo(item.id, item.quantity - item.returned_quantity);
      update public.products set stock = stock + item.quantity - item.returned_quantity where id = item.product_id;
      insert into public.stock_history(product_id, change_amount, reason) values (item.product_id, item.quantity - item.returned_quantity, 'order_deleted');
    end loop;
    update public.customers set balance = greatest(0, balance - greatest(0, new.total - new.paid_amount)) where id = new.customer_id;
  elsif new.is_deleted = false and old.is_deleted = true then
    for item in select id, product_id, quantity, returned_quantity from public.order_items where order_id = new.id loop
      perform public.consume_fifo(item.id, item.product_id, item.quantity - item.returned_quantity);
      update public.products set stock = stock - (item.quantity - item.returned_quantity) where id = item.product_id;
      insert into public.stock_history(product_id, change_amount, reason) values (item.product_id, -(item.quantity - item.returned_quantity), 'order_created');
    end loop;
    update public.customers set balance = balance + greatest(0, new.total - new.paid_amount) where id = new.customer_id;
  end if;
  return null;
end;
$$ language plpgsql security definer;

drop function if exists public.return_order_items(uuid, jsonb, uuid);
create or replace function public.return_order_items(p_order_id uuid, p_returns jsonb, p_user_id uuid, p_resolution text default null, p_refund_method text default null)
returns void as $$
declare
  line record;
  requested integer;
  returned_value numeric(12,2) := 0;
  original_total numeric(12,2);
  amount_already_paid numeric(12,2);
  new_order_total numeric(12,2);
  new_balance numeric(12,2);
  overpaid_amount numeric(12,2);
  customer_id_value uuid;
begin
  select total, paid_amount, customer_id into original_total, amount_already_paid, customer_id_value
  from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  for line in select * from public.order_items where order_id = p_order_id for update loop
    requested := coalesce((p_returns ->> line.id::text)::integer, 0);
    if requested < 0 or requested > line.quantity - line.returned_quantity then
      raise exception 'Invalid return quantity for order item %', line.id;
    end if;
    if requested > 0 then
      perform public.restore_fifo(line.id, requested);
      update public.order_items set returned_quantity = returned_quantity + requested where id = line.id;
      update public.products set stock = stock + requested where id = line.product_id;
      insert into public.stock_history(product_id, change_amount, reason) values (line.product_id, requested, 'order_return');
      returned_value := returned_value + requested * line.unit_price;
    end if;
  end loop;
  if returned_value <= 0 then raise exception 'Select at least one item to return'; end if;

  new_order_total := greatest(0, original_total - returned_value);
  new_balance := new_order_total - amount_already_paid;
  overpaid_amount := greatest(0, -new_balance);

  if overpaid_amount > 0 then
    if p_resolution not in ('refund', 'credit') then raise exception 'Choose how to resolve the overpaid amount'; end if;
    if p_resolution = 'refund' then
      if nullif(trim(p_refund_method), '') is null then raise exception 'Refund method is required'; end if;
      insert into public.refunds(order_id, amount, method, recorded_by)
      values (p_order_id, overpaid_amount, trim(p_refund_method), p_user_id);
    else
      update public.customers set credit_balance = credit_balance + overpaid_amount where id = customer_id_value;
    end if;
  end if;

  update public.orders
    set total = new_order_total,
        paid_amount = least(amount_already_paid, new_order_total),
        status = case when new_order_total = 0 or least(amount_already_paid, new_order_total) >= new_order_total then 'paid'
                      when least(amount_already_paid, new_order_total) > 0 then 'partial' else 'unpaid' end,
        has_returns = true,
        return_credit_amount = return_credit_amount + case when p_resolution = 'credit' then overpaid_amount else 0 end
    where id = p_order_id;
  -- trigger_order_balance applies new_outstanding - original_outstanding exactly once
  -- when the order total/paid amount update above completes.
  insert into public.audit_logs(user_id, action, target_table, target_id)
    values (p_user_id, 'Returned order items totaling ' || returned_value || case when overpaid_amount > 0 then '; ' || p_resolution || ' ' || overpaid_amount else '' end, 'orders', p_order_id);
end;
$$ language plpgsql security definer;

grant execute on function public.return_order_items(uuid, jsonb, uuid, text, text) to authenticated;
grant execute on function public.consume_stock_adjustment_fifo(uuid, integer) to authenticated;
