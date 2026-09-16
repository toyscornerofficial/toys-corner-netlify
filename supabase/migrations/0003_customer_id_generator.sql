-- ============================================================
-- 0003_customer_id_generator.sql
-- Generates TC000001, TC000002, ... automatically on insert.
--
-- Uses a Postgres SEQUENCE, not a frontend counter. A frontend counter
-- (e.g. "count existing customers + 1") breaks under double-submits or
-- two people saving at once. A sequence is atomic at the database level.
-- ============================================================

create sequence if not exists customer_id_seq start 1;

create or replace function fn_generate_customer_id()
returns trigger as $$
begin
  if new.unique_customer_id is null then
    new.unique_customer_id := 'TC' || lpad(nextval('customer_id_seq')::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_generate_customer_id on customers;
create trigger trg_generate_customer_id
  before insert on customers
  for each row execute function fn_generate_customer_id();
