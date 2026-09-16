-- ============================================================
-- 0022_user_management.sql
-- Adds an is_active toggle to profiles (for "disable user" without
-- deleting them), and makes activity_logs.changed_by safe to reference
-- when a user is later deleted — otherwise deleting a user who has any
-- activity log history would fail with a foreign key error.
-- ============================================================

alter table profiles
  add column if not exists is_active boolean not null default true;

alter table activity_logs
  drop constraint if exists activity_logs_changed_by_fkey;

alter table activity_logs
  add constraint activity_logs_changed_by_fkey
  foreign key (changed_by) references auth.users(id) on delete set null;
