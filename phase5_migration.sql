-- Phase 5 correction for existing Supabase projects.
-- trigger_order_balance already applies the paid_amount change to customer balance.
create or replace function public.handle_payment_recorded()
returns trigger as $$
begin
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
