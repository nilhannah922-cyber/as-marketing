-- Apply once to an existing Supabase project after feature_additions.sql.
alter table public.stock_entries
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
