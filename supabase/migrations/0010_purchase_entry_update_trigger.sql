-- ============================================================
-- 0010_purchase_entry_update_trigger.sql
-- Allows editing a Purchase Entry (qty or product) from the UI without
-- breaking stock accuracy. Previously only INSERT (increase) and DELETE
-- (reverse) triggers existed — editing qty directly would have left stock
-- wrong by the difference between old and new qty. This trigger adjusts
-- by the delta, or moves the adjustment to the new product if the product
-- itself was changed.
-- ============================================================

create or replace function fn_purchase_entry_update_stock()
returns trigger as $$
begin
  if old.product_id = new.product_id then
    -- Same product: adjust by the difference only (avoids double-counting
    -- the portion that didn't change).
    update products
    set current_stock = current_stock + (new.qty - old.qty)
    where id = new.product_id;
  else
    -- Product itself changed: fully reverse the old product's stock bump,
    -- then fully apply the new one.
    update products set current_stock = current_stock - old.qty where id = old.product_id;
    update products set current_stock = current_stock + new.qty where id = new.product_id;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_purchase_entry_update_stock on purchase_entries;
create trigger trg_purchase_entry_update_stock
  after update of qty, product_id on purchase_entries
  for each row execute function fn_purchase_entry_update_stock();
