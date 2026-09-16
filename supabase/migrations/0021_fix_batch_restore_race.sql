-- ============================================================
-- 0021_fix_batch_restore_race.sql
-- Already applied directly to the live database earlier. Re-added here
-- so the migrations folder has a complete, accurate history.
--
-- Fixes a race condition: deleting a sale_item fires two independent
-- AFTER DELETE actions — our own trigger (restore batch stock, then
-- remove the allocation record) and Postgres's automatic FK cascade
-- (remove the allocation record). Postgres doesn't guarantee which runs
-- first. Fix: remove the CASCADE, make the FK deferred instead, so our
-- trigger is the only thing that ever deletes allocation rows.
-- ============================================================

alter table sale_item_batch_allocations
  drop constraint if exists sale_item_batch_allocations_sale_item_id_fkey;

alter table sale_item_batch_allocations
  add constraint sale_item_batch_allocations_sale_item_id_fkey
  foreign key (sale_item_id) references sale_items(id)
  deferrable initially deferred;

update purchase_entries pe
set remaining_qty = pe.qty - coalesce(
  (select sum(a.qty) from sale_item_batch_allocations a where a.purchase_entry_id = pe.id),
  0
);

do $$
declare
  v_product record;
begin
  for v_product in select id from products loop
    perform fn_recompute_product_purchase_price(v_product.id);
  end loop;
end $$;
