-- ============================================================
-- 0009_settings_automation.sql
-- Adds the fields the daily-report Edge Function needs: who to email,
-- and whether each automated email is turned on.
-- (daily_report_time and stock_reminder_enabled already exist from 0001.)
-- ============================================================

alter table settings
  add column if not exists notification_email text,
  add column if not exists daily_report_enabled boolean not null default true;
