-- ============================================================
-- 0005_rls.sql
-- Row Level Security policies.
--
-- Locked decision: Admin and Staff share identical full access.
-- So this is deliberately simple: ONE policy per table, "any
-- authenticated user can do anything." No role-branching needed.
-- (role is stored on profiles for display/labeling only.)
-- ============================================================

alter table profiles enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table purchase_entries enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table expenses enable row level security;
alter table inquiries enable row level security;
alter table activity_logs enable row level security;
alter table settings enable row level security;

-- profiles: users can read all profiles (only 2 users, need to see each
-- other's name for e.g. "logged in as"), but only edit their own.
drop policy if exists "profiles_select_all" on profiles;
create policy "profiles_select_all" on profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- Every other table: full access for any authenticated user.
do $$
declare
  t text;
begin
  foreach t in array array[
    'products', 'customers', 'purchase_entries', 'sales',
    'sale_items', 'expenses', 'inquiries', 'settings'
  ]
  loop
    execute format(
      'drop policy if exists "%1$s_full_access" on %1$s;
       create policy "%1$s_full_access" on %1$s
       for all using (auth.role() = ''authenticated'')
       with check (auth.role() = ''authenticated'');',
      t
    );
  end loop;
end $$;

-- activity_logs: readable by any authenticated user, but never writable
-- directly (only the trigger writes to it, using security definer).
drop policy if exists "activity_logs_select" on activity_logs;
create policy "activity_logs_select" on activity_logs
  for select using (auth.role() = 'authenticated');
