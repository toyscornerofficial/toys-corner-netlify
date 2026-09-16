-- ============================================================
-- 0016_sales_discount_type.sql
-- Sales.discount already stores the computed ₹ amount, but not whether
-- that came from a flat ₹ entry or a % entry — so invoices/receipts/PDFs
-- couldn't show "10% off" vs "₹100 off" correctly. This adds that.
-- ============================================================

alter table sales
  add column if not exists discount_type text not null default 'flat' check (discount_type in ('flat', 'percent')),
  add column if not exists discount_value numeric(10, 2) not null default 0;

-- Update fn_create_sale to accept and store these two extra fields.
create or replace function fn_create_sale(
  p_customer_id uuid,
  p_payment_method text,
  p_discount numeric,
  p_notes text,
  p_items jsonb,
  p_discount_type text default 'flat',
  p_discount_value numeric default 0
)
returns table (sale_id uuid, invoice_no text)
language plpgsql
security invoker
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

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_line_total := (v_item->>'qty')::numeric * (v_item->>'price')::numeric
                    - coalesce((v_item->>'discount')::numeric, 0);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_grand_total := v_subtotal - coalesce(p_discount, 0);

  insert into sales (invoice_no, customer_id, subtotal, discount, grand_total, payment_method, notes, discount_type, discount_value)
  values (v_invoice_no, p_customer_id, v_subtotal, coalesce(p_discount, 0), v_grand_total, p_payment_method, p_notes,
          coalesce(p_discount_type, 'flat'), coalesce(p_discount_value, 0))
  returning id into v_sale_id;

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
