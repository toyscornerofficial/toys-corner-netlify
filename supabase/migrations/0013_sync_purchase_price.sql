-- ============================================================
-- 0013_sync_purchase_price.sql
-- Whenever a Purchase Entry is logged, the product's purchase_price updates
-- to match — so the "cost price" always reflects the most recent buying
-- price without needing to be manually kept in sync at product creation.
-- ============================================================

create or replace function fn_purchase_entry_sync_product_price()
returns trigger as $$
begin
  update products
  set purchase_price = new.purchase_price
  where id = new.product_id;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_purchase_entry_sync_product_price on purchase_entries;
create trigger trg_purchase_entry_sync_product_price
  after insert on purchase_entries
  for each row execute function fn_purchase_entry_sync_product_price();

-- Also sync on edit (from the Purchase Entry edit modal we added earlier),
-- so correcting a purchase entry's price also corrects the product's
-- reference cost, not just the stock quantity.
drop trigger if exists trg_purchase_entry_sync_product_price_update on purchase_entries;
create trigger trg_purchase_entry_sync_product_price_update
  after update of purchase_price on purchase_entries
  for each row execute function fn_purchase_entry_sync_product_price();
