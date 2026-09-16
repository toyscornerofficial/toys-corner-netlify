-- ============================================================
-- 0004_activity_logs.sql
-- Since Admin and Staff have identical full access (locked decision),
-- deletes need a paper trail. Logs DELETE on the tables where losing
-- a record silently would actually hurt (sales, expenses, products,
-- customers, purchase_entries).
-- ============================================================

create or replace function fn_log_activity()
returns trigger as $$
begin
  insert into activity_logs (table_name, record_id, action, changed_by, old_data)
  values (
    TG_TABLE_NAME,
    old.id,
    'DELETE',
    auth.uid(),
    to_jsonb(old)
  );
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_log_delete_sales on sales;
create trigger trg_log_delete_sales
  before delete on sales
  for each row execute function fn_log_activity();

drop trigger if exists trg_log_delete_expenses on expenses;
create trigger trg_log_delete_expenses
  before delete on expenses
  for each row execute function fn_log_activity();

drop trigger if exists trg_log_delete_products on products;
create trigger trg_log_delete_products
  before delete on products
  for each row execute function fn_log_activity();

drop trigger if exists trg_log_delete_customers on customers;
create trigger trg_log_delete_customers
  before delete on customers
  for each row execute function fn_log_activity();

drop trigger if exists trg_log_delete_purchase_entries on purchase_entries;
create trigger trg_log_delete_purchase_entries
  before delete on purchase_entries
  for each row execute function fn_log_activity();

-- Note: this fires BEFORE delete so old_data is captured, and runs as
-- security definer so it works even though activity_logs itself has RLS on.
