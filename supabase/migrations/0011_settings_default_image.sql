-- ============================================================
-- 0011_settings_default_image.sql
-- Lets the Admin configure a fallback image URL used automatically when a
-- product is added without an uploaded photo.
-- ============================================================

alter table settings
  add column if not exists default_product_image text;
