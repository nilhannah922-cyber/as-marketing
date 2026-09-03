-- Custom roles and granular permissions. Run after schema.sql.
create table if not exists public.roles (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique,
  description text,
  is_system_role boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.role_permissions (
  id uuid default uuid_generate_v4() primary key,
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null,
  granted boolean not null default true,
  unique (role_id, permission_key)
);

alter table public.users add column if not exists role_id uuid references public.roles(id) on delete restrict;

-- Permit an idempotent migration rerun to refresh protected system grants.
drop trigger if exists protect_system_role_permissions_trigger on public.role_permissions;
drop trigger if exists protect_role_integrity_trigger on public.roles;

insert into public.roles (name, description, is_system_role)
values
  ('Super admin', 'Protected full-access system role.', true),
  ('User', 'Protected standard operational user role.', true)
on conflict (name) do update set is_system_role = true;

with permission_keys(permission_key) as (values
  ('view_dashboard'), ('create_orders'), ('edit_orders'), ('delete_orders'),
  ('advance_order_status'), ('record_payments'), ('process_returns'), ('view_all_orders'),
  ('manage_products'), ('manage_categories'), ('manage_customers'), ('manage_stock'),
  ('manage_suppliers'), ('view_reports'), ('export_reports'), ('restore_deleted_records'),
  ('permanently_delete_records'), ('backup_restore')
)
insert into public.role_permissions (role_id, permission_key, granted)
select r.id, p.permission_key, true from public.roles r cross join permission_keys p
where r.name = 'Super admin'
on conflict (role_id, permission_key) do update set granted = true;

delete from public.role_permissions
where permission_key in ('manage_staff','delete_staff','manage_roles','view_audit_logs');

with user_permissions(permission_key) as (values
  ('view_dashboard'), ('create_orders'), ('edit_orders'), ('delete_orders'),
  ('advance_order_status'), ('record_payments'), ('process_returns'), ('view_all_orders'),
  ('manage_products'), ('manage_categories'), ('manage_customers'), ('manage_stock'),
  ('manage_suppliers'), ('view_reports'), ('export_reports'), ('restore_deleted_records')
)
insert into public.role_permissions (role_id, permission_key, granted)
select r.id, p.permission_key, true from public.roles r cross join user_permissions p
where r.name = 'User'
on conflict (role_id, permission_key) do update set granted = true;

update public.users u set role_id = r.id
from public.roles r
where u.role_id is null and r.name = case when u.role = 'superadmin' then 'Super admin' else 'User' end;

do $$ begin
  if exists (select 1 from public.users u left join public.roles r on r.id=u.role_id
    where u.role='superadmin' and (r.name is distinct from 'Super admin' or not coalesce(r.is_system_role,false))) then
    raise exception 'Migration verification failed: a legacy superadmin did not retain the protected Super admin role';
  end if;
  if exists (
    select 1 from unnest(array['view_dashboard','create_orders','edit_orders','delete_orders','advance_order_status','record_payments','process_returns','view_all_orders','manage_products','manage_categories','manage_customers','manage_stock','manage_suppliers','view_reports','export_reports','restore_deleted_records','permanently_delete_records','backup_restore']) expected(permission_key)
    where not exists (select 1 from public.roles r join public.role_permissions rp on rp.role_id=r.id
      where r.name='Super admin' and r.is_system_role and rp.permission_key=expected.permission_key and rp.granted)
  ) then raise exception 'Migration verification failed: Super admin is missing a permission'; end if;
end $$;
alter table public.users alter column role_id set not null;

create or replace function public.handle_new_user()
returns trigger as $$
declare default_role_id uuid;
begin
  select id into default_role_id from public.roles where name = 'User';
  insert into public.users (id, name, mobile, email, role, role_id, must_change_password)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'mobile', new.email, 'user', default_role_id,
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean,true));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.has_permission(check_user_id uuid, check_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    join public.roles r on r.id = u.role_id
    join public.role_permissions rp on rp.role_id = r.id
    where u.id = check_user_id and rp.permission_key = check_permission and rp.granted = true
  );
$$;
grant execute on function public.has_permission(uuid, text) to authenticated;
revoke execute on function public.has_permission(uuid, text) from public, anon;
grant execute on function public.has_permission(uuid, text) to service_role;

create or replace function public.is_super_admin(check_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users u join public.roles r on r.id=u.role_id
    where u.id=check_user_id and r.name='Super admin' and r.is_system_role=true);
$$;
revoke execute on function public.is_super_admin(uuid) from public, anon;
grant execute on function public.is_super_admin(uuid) to authenticated, service_role;

create or replace function public.current_permissions()
returns table(permission_key text) language sql stable security definer set search_path = public as $$
  select rp.permission_key from public.users u
  join public.role_permissions rp on rp.role_id = u.role_id
  where u.id = auth.uid() and rp.granted = true;
$$;
grant execute on function public.current_permissions() to authenticated;
revoke execute on function public.current_permissions() from public, anon;

create or replace function public.protect_role_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.is_system_role then raise exception 'System roles cannot be deleted'; end if;
  if tg_op = 'UPDATE' and old.is_system_role then raise exception 'System roles cannot be edited'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end; $$;
drop trigger if exists protect_role_integrity_trigger on public.roles;
create trigger protect_role_integrity_trigger before update or delete on public.roles
for each row execute function public.protect_role_integrity();

create or replace function public.protect_system_role_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
declare protected boolean;
begin
  select is_system_role into protected from public.roles where id = coalesce(new.role_id, old.role_id);
  if protected then raise exception 'System role permissions cannot be changed'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end; $$;
drop trigger if exists protect_system_role_permissions_trigger on public.role_permissions;
create trigger protect_system_role_permissions_trigger before insert or update or delete on public.role_permissions
for each row execute function public.protect_system_role_permissions();

create or replace function public.protect_user_role_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.role_id is distinct from old.role_id and not public.is_super_admin(auth.uid()) then
    raise exception 'Only Super admin can assign staff roles';
  end if;
  return new;
end; $$;
drop trigger if exists protect_user_role_assignment_trigger on public.users;
create trigger protect_user_role_assignment_trigger before update on public.users
for each row execute function public.protect_user_role_assignment();

alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;

-- Replace legacy policies with permission-aware policies.
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname='public' and tablename in ('users','roles','role_permissions','categories','products','customers','orders','order_items','payments','stock_history','stock_entries','stock_entry_items','suppliers','purchase_orders','purchase_order_items','audit_logs','refunds','stock_batches','order_item_batch_usage')
  loop execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end $$;

create policy users_select on public.users for select using (id=auth.uid() or public.is_super_admin(auth.uid()));
create policy users_update on public.users for update using (id=auth.uid() or public.is_super_admin(auth.uid())) with check (id=auth.uid() or public.is_super_admin(auth.uid()));
create policy users_delete on public.users for delete using (public.is_super_admin(auth.uid()) and id<>auth.uid());
create policy roles_select on public.roles for select using (auth.uid() is not null);
create policy roles_insert on public.roles for insert with check (public.is_super_admin(auth.uid()) and not is_system_role);
create policy roles_update on public.roles for update using (public.is_super_admin(auth.uid()) and not is_system_role) with check (not is_system_role);
create policy roles_delete on public.roles for delete using (public.is_super_admin(auth.uid()) and not is_system_role);
create policy role_permissions_select on public.role_permissions for select using (auth.uid() is not null);
create policy role_permissions_insert on public.role_permissions for insert with check (public.is_super_admin(auth.uid()));
create policy role_permissions_update on public.role_permissions for update using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));
create policy role_permissions_delete on public.role_permissions for delete using (public.is_super_admin(auth.uid()));

create policy categories_read on public.categories for select using (
  (public.has_permission(auth.uid(),'view_dashboard') or public.has_permission(auth.uid(),'create_orders') or public.has_permission(auth.uid(),'manage_categories') or public.has_permission(auth.uid(),'manage_products') or public.has_permission(auth.uid(),'manage_stock') or public.has_permission(auth.uid(),'view_reports') or public.has_permission(auth.uid(),'restore_deleted_records'))
  and (not is_deleted or public.has_permission(auth.uid(),'restore_deleted_records') or public.has_permission(auth.uid(),'permanently_delete_records'))
);
create policy categories_insert on public.categories for insert with check (public.has_permission(auth.uid(),'manage_categories'));
create policy categories_update on public.categories for update using (public.has_permission(auth.uid(),'manage_categories') or public.has_permission(auth.uid(),'restore_deleted_records')) with check (public.has_permission(auth.uid(),'manage_categories') or public.has_permission(auth.uid(),'restore_deleted_records'));
create policy categories_delete on public.categories for delete using (public.has_permission(auth.uid(),'permanently_delete_records'));
create policy products_read on public.products for select using (
  (public.has_permission(auth.uid(),'view_dashboard') or public.has_permission(auth.uid(),'create_orders') or public.has_permission(auth.uid(),'manage_products') or public.has_permission(auth.uid(),'manage_stock') or public.has_permission(auth.uid(),'view_reports') or public.has_permission(auth.uid(),'restore_deleted_records'))
  and (not is_deleted or public.has_permission(auth.uid(),'restore_deleted_records') or public.has_permission(auth.uid(),'permanently_delete_records'))
);
create policy products_insert on public.products for insert with check (public.has_permission(auth.uid(),'manage_products'));
create policy products_update on public.products for update using (public.has_permission(auth.uid(),'manage_products') or public.has_permission(auth.uid(),'manage_stock') or public.has_permission(auth.uid(),'restore_deleted_records')) with check (public.has_permission(auth.uid(),'manage_products') or public.has_permission(auth.uid(),'manage_stock') or public.has_permission(auth.uid(),'restore_deleted_records'));
create policy products_delete on public.products for delete using (public.has_permission(auth.uid(),'permanently_delete_records'));
create policy customers_read on public.customers for select using (
  (public.has_permission(auth.uid(),'view_dashboard') or public.has_permission(auth.uid(),'create_orders') or public.has_permission(auth.uid(),'manage_customers') or public.has_permission(auth.uid(),'record_payments') or public.has_permission(auth.uid(),'view_reports') or public.has_permission(auth.uid(),'restore_deleted_records'))
  and (not is_deleted or public.has_permission(auth.uid(),'restore_deleted_records') or public.has_permission(auth.uid(),'permanently_delete_records'))
);
create policy customers_insert on public.customers for insert with check (public.has_permission(auth.uid(),'manage_customers'));
create policy customers_update on public.customers for update using (public.has_permission(auth.uid(),'manage_customers') or public.has_permission(auth.uid(),'restore_deleted_records')) with check (public.has_permission(auth.uid(),'manage_customers') or public.has_permission(auth.uid(),'restore_deleted_records'));
create policy customers_delete on public.customers for delete using (public.has_permission(auth.uid(),'permanently_delete_records'));

create policy orders_read on public.orders for select using ((public.has_permission(auth.uid(),'view_all_orders') or created_by=auth.uid()) and (not is_deleted or public.has_permission(auth.uid(),'restore_deleted_records') or public.has_permission(auth.uid(),'permanently_delete_records')));
create policy orders_insert on public.orders for insert with check (public.has_permission(auth.uid(),'create_orders') and created_by=auth.uid());
create policy orders_update on public.orders for update using (public.has_permission(auth.uid(),'edit_orders') or public.has_permission(auth.uid(),'delete_orders') or public.has_permission(auth.uid(),'advance_order_status') or public.has_permission(auth.uid(),'restore_deleted_records'));
create policy orders_delete on public.orders for delete using (public.has_permission(auth.uid(),'permanently_delete_records'));
create policy order_items_read on public.order_items for select using (exists(select 1 from public.orders o where o.id=order_id and (public.has_permission(auth.uid(),'view_all_orders') or o.created_by=auth.uid())));
create policy order_items_insert on public.order_items for insert with check (public.has_permission(auth.uid(),'create_orders'));
create policy order_items_update on public.order_items for update using (public.has_permission(auth.uid(),'edit_orders'));
create policy order_items_delete on public.order_items for delete using (public.has_permission(auth.uid(),'edit_orders') or public.has_permission(auth.uid(),'permanently_delete_records'));
create policy payments_read on public.payments for select using (public.has_permission(auth.uid(),'record_payments') or public.has_permission(auth.uid(),'view_reports'));
create policy payments_insert on public.payments for insert with check (public.has_permission(auth.uid(),'record_payments'));
create policy payments_delete on public.payments for delete using (public.has_permission(auth.uid(),'permanently_delete_records'));

create policy stock_history_read on public.stock_history for select using (public.has_permission(auth.uid(),'manage_stock') or public.has_permission(auth.uid(),'view_reports'));
create policy stock_history_insert on public.stock_history for insert with check (public.has_permission(auth.uid(),'manage_stock') or public.has_permission(auth.uid(),'create_orders') or public.has_permission(auth.uid(),'edit_orders'));
create policy stock_entries_all on public.stock_entries for all using (public.has_permission(auth.uid(),'manage_stock')) with check (public.has_permission(auth.uid(),'manage_stock'));
create policy stock_entry_items_all on public.stock_entry_items for all using (public.has_permission(auth.uid(),'manage_stock')) with check (public.has_permission(auth.uid(),'manage_stock'));
create policy stock_batches_read on public.stock_batches for select using (public.has_permission(auth.uid(),'manage_stock') or public.has_permission(auth.uid(),'view_reports') or public.has_permission(auth.uid(),'create_orders'));
create policy stock_batches_write on public.stock_batches for all using (public.has_permission(auth.uid(),'manage_stock')) with check (public.has_permission(auth.uid(),'manage_stock'));
create policy batch_usage_read on public.order_item_batch_usage for select using (public.has_permission(auth.uid(),'view_reports') or public.has_permission(auth.uid(),'edit_orders'));
create policy batch_usage_write on public.order_item_batch_usage for all using (public.has_permission(auth.uid(),'manage_stock') or public.has_permission(auth.uid(),'edit_orders')) with check (public.has_permission(auth.uid(),'manage_stock') or public.has_permission(auth.uid(),'edit_orders'));
create policy suppliers_all on public.suppliers for all using (public.has_permission(auth.uid(),'manage_suppliers')) with check (public.has_permission(auth.uid(),'manage_suppliers'));
create policy purchase_orders_all on public.purchase_orders for all using (public.has_permission(auth.uid(),'manage_suppliers')) with check (public.has_permission(auth.uid(),'manage_suppliers'));
create policy purchase_order_items_all on public.purchase_order_items for all using (public.has_permission(auth.uid(),'manage_suppliers')) with check (public.has_permission(auth.uid(),'manage_suppliers'));
create policy refunds_read on public.refunds for select using (public.has_permission(auth.uid(),'process_returns') or public.has_permission(auth.uid(),'view_reports'));
create policy refunds_write on public.refunds for all using (public.has_permission(auth.uid(),'process_returns')) with check (public.has_permission(auth.uid(),'process_returns'));
create policy audit_read on public.audit_logs for select using (public.is_super_admin(auth.uid()));
create policy audit_insert on public.audit_logs for insert with check (user_id=auth.uid());

-- Recycle-bin views must apply the querying user's underlying table policies.
alter view if exists public.deleted_orders set (security_invoker = true);
alter view if exists public.deleted_products set (security_invoker = true);
alter view if exists public.deleted_customers set (security_invoker = true);

-- Backup/restore is intentionally a highly privileged permission. It needs full
-- table access to faithfully export and restore relational data.
create policy backup_users on public.users for select using (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_roles on public.roles for select using (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_role_permissions on public.role_permissions for select using (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_categories on public.categories for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_products on public.products for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_customers on public.customers for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_orders on public.orders for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_order_items on public.order_items for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_payments on public.payments for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_inventory on public.stock_history for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_stock_entries on public.stock_entries for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_stock_entry_items on public.stock_entry_items for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_suppliers on public.suppliers for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_purchase_orders on public.purchase_orders for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_purchase_order_items on public.purchase_order_items for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_refunds on public.refunds for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_stock_batches on public.stock_batches for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_batch_usage on public.order_item_batch_usage for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));
create policy backup_audit_logs on public.audit_logs for all using (public.has_permission(auth.uid(),'backup_restore')) with check (public.has_permission(auth.uid(),'backup_restore'));

-- Security-definer business functions bypass RLS, so expose permission-checking
-- wrappers and keep their implementations private.
do $$ begin
  if to_regprocedure('public.record_customer_payment_impl(uuid,numeric,uuid,text,text)') is null then
    alter function public.record_customer_payment(uuid,numeric,uuid,text,text) rename to record_customer_payment_impl;
  end if;
  if to_regprocedure('public.return_order_items_impl(uuid,jsonb,uuid,text,text)') is null then
    alter function public.return_order_items(uuid,jsonb,uuid,text,text) rename to return_order_items_impl;
  end if;
  if to_regprocedure('public.consume_stock_adjustment_fifo_impl(uuid,integer)') is null then
    alter function public.consume_stock_adjustment_fifo(uuid,integer) rename to consume_stock_adjustment_fifo_impl;
  end if;
end $$;
revoke all on function public.record_customer_payment_impl(uuid,numeric,uuid,text,text) from public, anon, authenticated;
revoke all on function public.return_order_items_impl(uuid,jsonb,uuid,text,text) from public, anon, authenticated;
revoke all on function public.consume_stock_adjustment_fifo_impl(uuid,integer) from public, anon, authenticated;

create or replace function public.record_customer_payment(p_customer_id uuid,p_amount numeric,p_user_id uuid,p_resolution text default null,p_refund_method text default null)
returns jsonb language plpgsql security definer set search_path=public as $$ begin
  if not public.has_permission(auth.uid(),'record_payments') then raise exception 'Permission denied: record_payments'; end if;
  return public.record_customer_payment_impl(p_customer_id,p_amount,auth.uid(),p_resolution,p_refund_method);
end $$;
create or replace function public.return_order_items(p_order_id uuid,p_returns jsonb,p_user_id uuid,p_resolution text default null,p_refund_method text default null)
returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.has_permission(auth.uid(),'process_returns') then raise exception 'Permission denied: process_returns'; end if;
  perform public.return_order_items_impl(p_order_id,p_returns,auth.uid(),p_resolution,p_refund_method);
end $$;
create or replace function public.consume_stock_adjustment_fifo(p_product_id uuid,p_quantity integer)
returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.has_permission(auth.uid(),'manage_stock') then raise exception 'Permission denied: manage_stock'; end if;
  perform public.consume_stock_adjustment_fifo_impl(p_product_id,p_quantity);
end $$;
grant execute on function public.record_customer_payment(uuid,numeric,uuid,text,text) to authenticated;
grant execute on function public.return_order_items(uuid,jsonb,uuid,text,text) to authenticated;
grant execute on function public.consume_stock_adjustment_fifo(uuid,integer) to authenticated;

create or replace function public.enforce_product_permission_columns()
returns trigger language plpgsql security definer set search_path=public as $$ begin
  if public.has_permission(auth.uid(),'manage_products') or public.has_permission(auth.uid(),'backup_restore') then return new; end if;
  if public.has_permission(auth.uid(),'manage_stock') and
     row(new.category_id,new.name,new.sku,new.barcode,new.selling_price,new.image_url,new.description,new.is_deleted,new.deleted_at)
     is not distinct from row(old.category_id,old.name,old.sku,old.barcode,old.selling_price,old.image_url,old.description,old.is_deleted,old.deleted_at)
  then return new; end if;
  if (public.has_permission(auth.uid(),'create_orders') or public.has_permission(auth.uid(),'edit_orders') or public.has_permission(auth.uid(),'process_returns')) and
     row(new.category_id,new.name,new.sku,new.barcode,new.cost_price,new.selling_price,new.image_url,new.description,new.is_deleted,new.deleted_at)
     is not distinct from row(old.category_id,old.name,old.sku,old.barcode,old.cost_price,old.selling_price,old.image_url,old.description,old.is_deleted,old.deleted_at)
  then return new; end if;
  if public.has_permission(auth.uid(),'restore_deleted_records') and
     row(new.is_deleted,new.deleted_at) is distinct from row(old.is_deleted,old.deleted_at) and
     row(new.category_id,new.name,new.sku,new.barcode,new.cost_price,new.selling_price,new.stock,new.image_url,new.description)
       is not distinct from row(old.category_id,old.name,old.sku,old.barcode,old.cost_price,old.selling_price,old.stock,old.image_url,old.description)
  then return new; end if;
  raise exception 'Permission denied: manage_products';
end $$;
drop trigger if exists enforce_product_permission_columns_trigger on public.products;
create trigger enforce_product_permission_columns_trigger before update on public.products for each row execute function public.enforce_product_permission_columns();

create or replace function public.enforce_order_permission_columns()
returns trigger language plpgsql security definer set search_path=public as $$ begin
  if public.has_permission(auth.uid(),'edit_orders') or public.has_permission(auth.uid(),'backup_restore') then return new; end if;
  if public.has_permission(auth.uid(),'record_payments') and row(new.paid_amount,new.status) is distinct from row(old.paid_amount,old.status)
     and row(new.customer_id,new.total,new.pack_status,new.is_deleted,new.deleted_at,new.created_by)
       is not distinct from row(old.customer_id,old.total,old.pack_status,old.is_deleted,old.deleted_at,old.created_by) then return new; end if;
  if public.has_permission(auth.uid(),'process_returns') and
     row(new.customer_id,new.pack_status,new.is_deleted,new.deleted_at,new.created_by)
       is not distinct from row(old.customer_id,old.pack_status,old.is_deleted,old.deleted_at,old.created_by) then return new; end if;
  if public.has_permission(auth.uid(),'restore_deleted_records') and row(new.is_deleted,new.deleted_at) is distinct from row(old.is_deleted,old.deleted_at)
     and (to_jsonb(new) - 'is_deleted' - 'deleted_at') = (to_jsonb(old) - 'is_deleted' - 'deleted_at') then return new; end if;
  if public.has_permission(auth.uid(),'delete_orders') and row(new.is_deleted,new.deleted_at) is distinct from row(old.is_deleted,old.deleted_at)
     and row(new.customer_id,new.total,new.paid_amount,new.status,new.pack_status,new.created_by)
       is not distinct from row(old.customer_id,old.total,old.paid_amount,old.status,old.pack_status,old.created_by) then return new; end if;
  if public.has_permission(auth.uid(),'advance_order_status') and row(new.pack_status,new.transport_name) is distinct from row(old.pack_status,old.transport_name)
     and row(new.customer_id,new.total,new.paid_amount,new.status,new.is_deleted,new.deleted_at,new.created_by)
       is not distinct from row(old.customer_id,old.total,old.paid_amount,old.status,old.is_deleted,old.deleted_at,old.created_by) then return new; end if;
  raise exception 'Permission denied: edit_orders';
end $$;
drop trigger if exists enforce_order_permission_columns_trigger on public.orders;
create trigger enforce_order_permission_columns_trigger before update on public.orders for each row execute function public.enforce_order_permission_columns();

create or replace function public.enforce_recycle_update_columns()
returns trigger language plpgsql security definer set search_path=public as $$ begin
  if public.has_permission(auth.uid(),case when tg_table_name='categories' then 'manage_categories' else 'manage_customers' end)
     or public.has_permission(auth.uid(),'backup_restore') then return new; end if;
  if public.has_permission(auth.uid(),'restore_deleted_records') and row(new.is_deleted,new.deleted_at) is distinct from row(old.is_deleted,old.deleted_at) then
    if (to_jsonb(new) - 'is_deleted' - 'deleted_at') = (to_jsonb(old) - 'is_deleted' - 'deleted_at') then return new; end if;
  end if;
  raise exception 'Permission denied for recycle-bin update';
end $$;
drop trigger if exists enforce_category_recycle_columns_trigger on public.categories;
create trigger enforce_category_recycle_columns_trigger before update on public.categories for each row execute function public.enforce_recycle_update_columns();
drop trigger if exists enforce_customer_recycle_columns_trigger on public.customers;
create trigger enforce_customer_recycle_columns_trigger before update on public.customers for each row execute function public.enforce_recycle_update_columns();
