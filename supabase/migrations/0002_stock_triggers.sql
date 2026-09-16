-- ============================================================
-- 0002_stock_triggers.sql
-- Automatic stock updates. Built in Postgres so stock stays correct
-- no matter what touches these tables later (bulk import, direct edits, etc).
--
-- Negative stock is intentionally ALLOWED (locked decision): a sale can
-- exceed available stock, going negative, to be corrected by a later
-- purchase entry. See is_backorder flag on sale_items.
-- ============================================================

-- ---------- Purchase entry -> stock increase ----------
create or replace function fn_purchase_entry_increase_stock()
returns trigger as $$
begin
  update products
  set current_stock = current_stock + new.qty
  where id = new.product_id;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_purchase_entry_increase_stock on purchase_entries;
create trigger trg_purchase_entry_increase_stock
  after insert on purchase_entries
  for each row execute function fn_purchase_entry_increase_stock();


-- ---------- Sale item insert -> stock decrease (negative allowed) ----------
create or replace function fn_sale_item_decrease_stock()
returns trigger as $$
declare
  stock_before integer;
begin
  select current_stock into stock_before from products where id = new.product_id;

  update products
  set current_stock = current_stock - new.qty
  where id = new.product_id;

  -- Flag this line item as a backorder if it pushed stock below zero,
  -- so Reports can filter "sales made without stock in hand".
  if stock_before < new.qty then
    update sale_items set is_backorder = true where id = new.id;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sale_item_decrease_stock on sale_items;
create trigger trg_sale_item_decrease_stock
  after insert on sale_items
  for each row execute function fn_sale_item_decrease_stock();


-- ---------- Sale item delete -> reverse stock ----------
-- Handles: deleting a whole sale (cascades to sale_items -> this fires per row),
-- or deleting/editing a single line item.
create or replace function fn_sale_item_reverse_stock()
returns trigger as $$
begin
  update products
  set current_stock = current_stock + old.qty
  where id = old.product_id;

  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_sale_item_reverse_stock on sale_items;
create trigger trg_sale_item_reverse_stock
  after delete on sale_items
  for each row execute function fn_sale_item_reverse_stock();


-- ---------- Purchase entry delete -> reverse stock ----------
-- Symmetric safety net: if a purchase entry was logged wrong and gets deleted,
-- don't leave stock permanently inflated.
create or replace function fn_purchase_entry_reverse_stock()
returns trigger as $$
begin
  update products
  set current_stock = current_stock - old.qty
  where id = old.product_id;

  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_purchase_entry_reverse_stock on purchase_entries;
create trigger trg_purchase_entry_reverse_stock
  after delete on purchase_entries
  for each row execute function fn_purchase_entry_reverse_stock();
