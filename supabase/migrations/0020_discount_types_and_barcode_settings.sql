-- ============================================================
-- 0020_discount_types_and_barcode_settings.sql
-- Adds:
--  - discount_type on products (flat/percent) — mirrors the Order Discount
--    type we already added to sales, but for the product's own discount.
--  - Settings defaults for new product discount type and checkout discount
--    type (flat/percent/both).
--  - Barcode auto-generation toggle + a sequence-backed generator function.
-- ============================================================

alter table products
  add column if not exists discount_type text not null default 'flat' check (discount_type in ('flat', 'percent'));

alter table settings
  add column if not exists default_product_discount_type text not null default 'flat' check (default_product_discount_type in ('flat', 'percent')),
  add column if not exists default_checkout_discount_type text not null default 'both' check (default_checkout_discount_type in ('flat', 'percent', 'both')),
  add column if not exists auto_generate_barcode boolean not null default false;

-- ---------- Barcode auto-generation ----------
create sequence if not exists product_barcode_seq start 1;

create or replace function fn_generate_product_barcode()
returns text
language plpgsql
as $$
begin
  return 'P' || lpad(nextval('product_barcode_seq')::text, 6, '0');
end;
$$;
