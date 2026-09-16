-- ============================================================
-- 0018_batch_inventory_fifo.sql
-- Converts stock tracking from "one purchase price per product" to
-- proper batch/lot costing with FIFO consumption on sale. Every Purchase
-- Entry is already effectively a "batch" (its own date/price/qty) — this
-- adds the missing piece: how much of THAT specific batch remains, and
-- which batch(es) a sale actually drew from.
--
-- products.purchase_price changes meaning: instead of "the last batch we
-- bought," it becomes "the weighted-average cost of stock currently on
-- hand" — recalculated automatically. Old batch prices are NEVER
-- destroyed; they live permanently in purchase_entries. This keeps every
-- existing reader of products.purchase_price (Dashboard, Reports, Stock
-- page) working without modification, just more accurate.
-- ============================================================

-- ---------- Retire the old "just overwrite with latest" behavior ----------
drop trigger if exists trg_purchase_entry_sync_product_price on purchase_entries;
drop trigger if exists trg_purchase_entry_sync_product_price_update on purchase_entries;
drop function if exists fn_purchase_entry_sync_product_price();

-- ---------- Schema additions ----------
alter table purchase_entries
  add column if not exists remaining_qty integer not null default 0;

alter table products
  add column if not exists last_purchase_price numeric(10, 2); -- reference only, not used in calculations

create table if not exists sale_item_batch_allocations (
  id uuid primary key default gen_random_uuid(),
  sale_item_id uuid not null references sale_items(id) on delete cascade,
  purchase_entry_id uuid not null references purchase_entries(id) on delete restrict,
  qty integer not null check (qty > 0),
  unit_cost numeric(10, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_allocations_sale_item on sale_item_batch_allocations(sale_item_id);
create index if not exists idx_allocations_purchase_entry on sale_item_batch_allocations(purchase_entry_id);

alter table sale_item_batch_allocations enable row level security;
drop policy if exists "allocations_read" on sale_item_batch_allocations;
drop policy if exists "allocations_write" on sale_item_batch_allocations;
create policy "allocations_full_access" on sale_item_batch_allocations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table sale_items
  add column if not exists cost_total numeric(10, 2);

-- ---------- Helper: recompute the weighted-average cost of stock on hand ----------
create or replace function fn_recompute_product_purchase_price(p_product_id uuid)
returns void as $$
declare
  v_weighted_sum numeric;
  v_total_qty integer;
begin
  select coalesce(sum(remaining_qty * purchase_price), 0), coalesce(sum(remaining_qty), 0)
  into v_weighted_sum, v_total_qty
  from purchase_entries
  where product_id = p_product_id and remaining_qty > 0;

  if v_total_qty > 0 then
    update products
    set purchase_price = round(v_weighted_sum / v_total_qty, 2)
    where id = p_product_id;
  end if;
end;
$$ language plpgsql;

-- ---------- Purchase Entry: initialize remaining_qty on insert ----------
create or replace function fn_purchase_entry_init_remaining()
returns trigger as $$
begin
  new.remaining_qty := new.qty;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_purchase_entry_init_remaining on purchase_entries;
create trigger trg_purchase_entry_init_remaining
  before insert on purchase_entries
  for each row execute function fn_purchase_entry_init_remaining();

-- ---------- Purchase Entry insert: stock += qty, track last price, recompute avg ----------
create or replace function fn_purchase_entry_increase_stock()
returns trigger as $$
begin
  update products
  set current_stock = current_stock + new.qty,
      last_purchase_price = new.purchase_price
  where id = new.product_id;

  perform fn_recompute_product_purchase_price(new.product_id);

  return new;
end;
$$ language plpgsql;

-- ---------- Purchase Entry update (qty/product edit): adjust remaining_qty safely ----------
create or replace function fn_purchase_entry_update_stock()
returns trigger as $$
declare
  v_qty_delta integer;
  v_new_remaining integer;
begin
  if old.product_id = new.product_id then
    v_qty_delta := new.qty - old.qty;
    v_new_remaining := old.remaining_qty + v_qty_delta;

    if v_new_remaining < 0 then
      raise exception 'Cannot reduce quantity below what has already been sold from this batch (% already sold)',
        old.qty - old.remaining_qty;
    end if;

    update purchase_entries set remaining_qty = v_new_remaining where id = new.id;
    update products set current_stock = current_stock + v_qty_delta where id = new.product_id;
    perform fn_recompute_product_purchase_price(new.product_id);
  else
    if old.remaining_qty < old.qty then
      raise exception 'Cannot change the product on a batch that has already been sold from';
    end if;

    update products set current_stock = current_stock - old.qty where id = old.product_id;
    update products set current_stock = current_stock + new.qty where id = new.product_id;
    update purchase_entries set remaining_qty = new.qty where id = new.id;

    perform fn_recompute_product_purchase_price(old.product_id);
    perform fn_recompute_product_purchase_price(new.product_id);
  end if;

  return new;
end;
$$ language plpgsql;

-- ---------- Purchase Entry delete: block if already sold from, else reverse ----------
create or replace function fn_purchase_entry_reverse_stock()
returns trigger as $$
begin
  if old.remaining_qty < old.qty then
    raise exception 'Cannot delete this batch — % unit(s) from it have already been sold. Delete those sales first if this was a mistake.',
      old.qty - old.remaining_qty;
  end if;

  update products
  set current_stock = current_stock - old.qty
  where id = old.product_id;

  perform fn_recompute_product_purchase_price(old.product_id);

  return old;
end;
$$ language plpgsql;

-- ---------- Sale item insert: FIFO-consume batches oldest-first ----------
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

  update sale_items set cost_total = v_cost_total where id = new.id;

  perform fn_recompute_product_purchase_price(new.product_id);

  return new;
end;
$$ language plpgsql;

-- ---------- Sale item delete: restore whichever batches it consumed ----------
create or replace function fn_sale_item_reverse_stock()
returns trigger as $$
begin
  update products
  set current_stock = current_stock + old.qty
  where id = old.product_id;

  update purchase_entries pe
  set remaining_qty = pe.remaining_qty + a.qty
  from sale_item_batch_allocations a
  where a.sale_item_id = old.id and a.purchase_entry_id = pe.id;

  delete from sale_item_batch_allocations where sale_item_id = old.id;

  perform fn_recompute_product_purchase_price(old.product_id);

  return old;
end;
$$ language plpgsql;

-- ---------- One-time backfill for data created before this migration ----------
update purchase_entries set remaining_qty = qty where remaining_qty = 0 and qty > 0;

do $$
declare
  v_product record;
begin
  for v_product in select id from products loop
    perform fn_recompute_product_purchase_price(v_product.id);
  end loop;
end $$;
