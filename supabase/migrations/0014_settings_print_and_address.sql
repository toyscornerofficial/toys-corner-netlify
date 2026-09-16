-- ============================================================
-- 0014_settings_print_and_address.sql
-- Adds: business address + phone (with independent show/hide toggles for
-- printed output), toggles to enable/disable each print action app-wide,
-- and an Enable SSL toggle for Gmail SMTP.
-- ============================================================

alter table settings
  add column if not exists business_address text,
  add column if not exists business_phone text,
  add column if not exists show_address_on_print boolean not null default true,
  add column if not exists show_phone_on_print boolean not null default true,
  add column if not exists enable_download_pdf boolean not null default true,
  add column if not exists enable_print_invoice boolean not null default true,
  add column if not exists enable_print_receipt boolean not null default true,
  add column if not exists smtp_enable_ssl boolean not null default true;
