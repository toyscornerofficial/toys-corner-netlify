-- ============================================================
-- 0012_settings_smtp_password.sql
-- Adds a field to store the Gmail App Password (or other SMTP password)
-- for reference, if you switch the daily report from Resend to SMTP.
--
-- SECURITY NOTE: this stores the value as plain text in the settings
-- table, readable by any authenticated user (both Admin and Staff, per
-- the shared-access design from Phase 3). This is acceptable for a
-- single App Password used only for outbound email on a small trusted
-- 2-person system, but is NOT a substitute for a proper secrets manager.
-- Do not reuse your actual Gmail account password here — only ever use
-- a generated App Password, which can be revoked independently at any
-- time from your Google Account if needed.
-- ============================================================

alter table settings
  add column if not exists smtp_password text;
