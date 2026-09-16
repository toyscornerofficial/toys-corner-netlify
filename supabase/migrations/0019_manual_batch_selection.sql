-- ============================================================
-- 0019_manual_batch_selection.sql
-- Adds Option 2 (manual batch selection) alongside the existing Option 1
-- (automatic FIFO) from 0018, switchable via a Settings toggle so both
-- can be tried with real data before committing to one.
--
-- When a sale_item carries a selected_batch_id, that ONE batch is consumed
-- for the full line qty (capped in the UI so this can't request more than
-- that batch has). When selected_batch_id is null, behavior is unchanged
-- from 0018 — automatic FIFO across all batches with stock.
--
-- Reversal (deleting a sale_item) needs NO changes — it already restores
-- whichever batches were recorded in sale_item_batch_allocations,
-- regardless of whether those came from manual or automatic consumption.
-- ============================================================

alter table settings
  add column if not exists batch_selection_mode text not null default 'auto'
    check (batch_selection_mode in ('auto', 'manual'));

alter table sale_items
  add column if not exists selected_batch_id uuid references purchase_entries(id);

-- ---------- Sale item insert: manual batch (if specified) or automatic FIFO ----------
create or replace function fn_sale_item_decrease_stock()
returns trigger as $$
declare
  stock_before integer;
  v_remaining_needed integer := new.qty;
  v_batch record;
  v_take integer;
  v_cost_total numeric := 0;
  v_fallback_cost numeric;
begin
  select current_stock into stock_before from products where id = new.product_id;

  update products
  set current_stock = current_stock - new.qty
  where id = new.product_id;

  if stock_before < new.qty then
    update sale_items set is_backorder = true where id = new.id;
  end if;

  if new.selected_batch_id is not null then
    -- Manual mode: consume the whole line from exactly this one batch.
    select id, remaining_qty, purchase_price into v_batch
    from purchase_entries
    where id = new.selected_batch_id
    for update;

    if v_batch.remaining_qty < new.qty then
      raise exception 'Selected batch only has % remaining, but % were requested', v_batch.remaining_qty, new.qty;
    end if;

    insert into sale_item_batch_allocations (sale_item_id, purchase_entry_id, qty, unit_cost)
    values (new.id, v_batch.id, new.qty, v_batch.purchase_price);

    update purchase_entries set remaining_qty = remaining_qty - new.qty where id = v_batch.id;

    v_cost_total := new.qty * v_batch.purchase_price;
  else
    -- Automatic mode: consume from the oldest batch with stock remaining, first.
    for v_batch in
      select id, remaining_qty, purchase_price
      from purchase_entries
      where product_id = new.product_id and remaining_qty > 0
      order by date asc, created_at asc
      for update
    loop
      exit when v_remaining_needed <= 0;

      v_take := least(v_batch.remaining_qty, v_remaining_needed);

      insert into sale_item_batch_allocations (sale_item_id, purchase_entry_id, qty, unit_cost)
      values (new.id, v_batch.id, v_take, v_batch.purchase_price);

      update purchase_entries set remaining_qty = remaining_qty - v_take where id = v_batch.id;

      v_cost_total := v_cost_total + (v_take * v_batch.purchase_price);
      v_remaining_needed := v_remaining_needed - v_take;
    end loop;

    if v_remaining_needed > 0 then
      select coalesce(last_purchase_price, purchase_price, 0) into v_fallback_cost
      from products where id = new.product_id;
      v_cost_total := v_cost_total + (v_remaining_needed * coalesce(v_fallback_cost, 0));
    end if;
  end if;

  update sale_items set cost_total = v_cost_total where id = new.id;

  perform fn_recompute_product_purchase_price(new.product_id);

  return new;
end;
$$ language plpgsql;

-- ---------- fn_create_sale: accept an optional selected_batch_id per item ----------
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

    insert into sale_items (sale_id, product_id, qty, price, discount, total, selected_batch_id)
    values (
      v_sale_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'qty')::integer,
      (v_item->>'price')::numeric,
      coalesce((v_item->>'discount')::numeric, 0),
      v_line_total,
      nullif(v_item->>'selected_batch_id', '')::uuid
    );
  end loop;

  return query select v_sale_id, v_invoice_no;
end;
$$;
