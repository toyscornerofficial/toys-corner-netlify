-- ============================================================
-- 0015_categories.sql
-- Product categories, managed via Settings so they're consistent across
-- the Add Product form instead of a hardcoded list in the frontend.
-- ============================================================

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

alter table categories enable row level security;

drop policy if exists "categories_full_access" on categories;
create policy "categories_full_access" on categories
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Seed with the categories already in use, so nothing breaks for existing products
insert into categories (name) values
  ('Toys'), ('Games'), ('Puzzles'), ('Soft Toys'), ('Educational'), ('Outdoor'), ('Other')
on conflict (name) do nothing;
