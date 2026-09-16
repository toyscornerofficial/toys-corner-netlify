-- ============================================================
-- 0008_sales_rpc.sql
-- Invoice number generator + atomic sale creation function.
--
-- Why an RPC instead of two separate inserts from the frontend:
-- if the sales insert succeeds but the sale_items insert fails
-- partway through (network drop, validation error on item 3 of 5),
-- a two-step frontend approach leaves a half-saved order with wrong
-- stock deductions. Wrapping both in one Postgres function makes it
-- atomic — either the whole sale saves, or none of it does.
-- ============================================================

create sequence if not exists invoice_no_seq start 1;

create or replace function fn_create_sale(
  p_customer_id uuid,
  p_payment_method text,
  p_discount numeric,
  p_notes text,
  p_items jsonb  -- array of {product_id, qty, price, discount}
)
returns table (sale_id uuid, invoice_no text)
language plpgsql
security invoker  -- runs as the calling user, so RLS policies still apply normally
as $$
declare
  v_sale_id uuid;
  v_invoice_no text;
  v_subtotal numeric := 0;
  v_grand_total numeric;
  v_item jsonb;
  v_line_total numeric;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Cannot create a sale with no items';
  end if;

  v_invoice_no := 'INV' || lpad(nextval('invoice_no_seq')::text, 6, '0');

  -- Compute subtotal across all line items first
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_line_total := (v_item->>'qty')::numeric * (v_item->>'price')::numeric
                    - coalesce((v_item->>'discount')::numeric, 0);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_grand_total := v_subtotal - coalesce(p_discount, 0);

  insert into sales (invoice_no, customer_id, subtotal, discount, grand_total, payment_method, notes)
  values (v_invoice_no, p_customer_id, v_subtotal, coalesce(p_discount, 0), v_grand_total, p_payment_method, p_notes)
  returning id into v_sale_id;

  -- Insert line items — the 0002_stock_triggers.sql trigger fires per row
  -- and handles stock deduction (including negative-stock/backorder flagging)
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_line_total := (v_item->>'qty')::numeric * (v_item->>'price')::numeric
                    - coalesce((v_item->>'discount')::numeric, 0);

    insert into sale_items (sale_id, product_id, qty, price, discount, total)
    values (
      v_sale_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'qty')::integer,
      (v_item->>'price')::numeric,
      coalesce((v_item->>'discount')::numeric, 0),
      v_line_total
    );
  end loop;

  return query select v_sale_id, v_invoice_no;
end;
$$;
