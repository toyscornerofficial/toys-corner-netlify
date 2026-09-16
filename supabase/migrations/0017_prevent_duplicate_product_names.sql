-- ============================================================
-- 0017_prevent_duplicate_product_names.sql
-- Hard-prevents two products from having the same name (case-insensitive,
-- trimmed) — this is the root cause of "two Kids Teddy entries with
-- different prices": someone used Add Product twice instead of Add
-- Product once + Purchase Entry for restocks, creating two independent
-- product rows that both matched search.
-- ============================================================

create unique index if not exists idx_products_name_unique_ci
  on products (lower(trim(product_name)));
