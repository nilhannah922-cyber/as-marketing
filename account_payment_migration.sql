-- Allocate one customer-level payment across outstanding orders, oldest first.
create or replace function public.record_customer_payment(
  p_customer_id uuid, p_amount numeric, p_user_id uuid,
  p_resolution text default null, p_refund_method text default null
)
returns jsonb as $$
declare
  order_row record;
  total_outstanding numeric(12,2);
  remaining_payment numeric(12,2);
  order_outstanding numeric(12,2);
  allocated_amount numeric(12,2);
  remaining_order_balance numeric(12,2);
  excess_amount numeric(12,2);
  last_order_id uuid;
  allocation_count integer := 0;
  allocations jsonb := '[]'::jsonb;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Enter a valid payment amount'; end if;

  -- Serialize payments for this customer and lock every eligible order.
  perform 1 from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found'; end if;
  perform 1 from public.orders
    where customer_id = p_customer_id and is_deleted = false and total > paid_amount
    for update;

  select coalesce(sum(total - paid_amount), 0) into total_outstanding
  from public.orders
  where customer_id = p_customer_id and is_deleted = false and total > paid_amount;
  if total_outstanding <= 0 then raise exception 'This customer has no outstanding orders'; end if;

  excess_amount := greatest(0, p_amount - total_outstanding);
  if excess_amount > 0 and p_resolution not in ('refund', 'credit') then
    raise exception 'Choose how to resolve the excess payment';
  end if;
  if excess_amount > 0 and p_resolution = 'refund' and nullif(trim(p_refund_method), '') is null then
    raise exception 'Refund method is required';
  end if;

  remaining_payment := least(p_amount, total_outstanding);
  for order_row in
    select id, order_number, total, paid_amount
    from public.orders
    where customer_id = p_customer_id and is_deleted = false and total > paid_amount
    order by created_at asc, order_number asc, id asc
  loop
    exit when remaining_payment <= 0;
    order_outstanding := order_row.total - order_row.paid_amount;
    allocated_amount := least(remaining_payment, order_outstanding);
    remaining_order_balance := order_outstanding - allocated_amount;

    -- The existing payment trigger updates order paid/status and customer balance.
    insert into public.payments(order_id, amount, recorded_by)
    values (order_row.id, allocated_amount, p_user_id);
    insert into public.audit_logs(user_id, action, target_table, target_id)
    values (p_user_id, 'Customer payment allocation: ' || allocated_amount, 'orders', order_row.id);

    allocations := allocations || jsonb_build_array(jsonb_build_object(
      'order_id', order_row.id, 'order_number', order_row.order_number,
      'amount', allocated_amount, 'remaining', remaining_order_balance,
      'status', case when remaining_order_balance = 0 then 'paid' else 'partial' end
    ));
    last_order_id := order_row.id;
    allocation_count := allocation_count + 1;
    remaining_payment := remaining_payment - allocated_amount;
  end loop;

  if excess_amount > 0 then
    if p_resolution = 'refund' then
      -- refunds.order_id is required, so use the final allocated order as the reference.
      insert into public.refunds(order_id, amount, method, recorded_by)
      values (last_order_id, excess_amount, trim(p_refund_method), p_user_id);
    else
      update public.customers set credit_balance = credit_balance + excess_amount where id = p_customer_id;
    end if;
  end if;

  insert into public.audit_logs(user_id, action, target_table, target_id)
  values (p_user_id,
    'Recorded customer payment ' || p_amount || ' across ' || allocation_count || ' order(s)' ||
      case when excess_amount > 0 then '; ' || p_resolution || ' excess ' || excess_amount else '' end,
    'customers', p_customer_id);

  return jsonb_build_object('allocations', allocations, 'excess', excess_amount, 'resolution', p_resolution);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.record_customer_payment(uuid, numeric, uuid, text, text) to authenticated;
