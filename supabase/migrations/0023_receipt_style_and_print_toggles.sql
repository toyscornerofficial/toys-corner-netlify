-- ============================================================
-- 0023_receipt_style_and_print_toggles.sql
-- Adds:
--  - Receipt print style options (font family/weight/size) so different
--    thermal printers can be tuned from Settings without a redeploy.
--  - Toggles for showing GST number and WhatsApp number on printed
--    output, matching the pattern already used for address/phone.
-- ============================================================

alter table settings
  add column if not exists receipt_font_family text not null default 'sans' check (receipt_font_family in ('sans', 'monospace')),
  add column if not exists receipt_font_weight text not null default 'extrabold' check (receipt_font_weight in ('bold', 'extrabold')),
  add column if not exists receipt_font_size text not null default 'normal' check (receipt_font_size in ('normal', 'large')),
  add column if not exists show_gst_on_print boolean not null default true,
  add column if not exists show_whatsapp_on_print boolean not null default true;
