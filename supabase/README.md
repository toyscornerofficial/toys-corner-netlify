# Running the Phase 3 Migrations

## How to run

Supabase Dashboard → SQL Editor → paste and run **each file in order**, 0001 through 0006.
(Or use the Supabase CLI: `supabase db push` if you've set up migrations that way —
just make sure these files are in your `supabase/migrations` folder with these names,
since numeric prefixes control execution order.)

Do NOT skip ahead or run out of order — 0002 depends on 0001's tables existing, 0005's
RLS references tables from 0001, etc.

## After 0001–0006 run: create your 2 real users

The seed data assumes 2 auth users exist. Do this in Supabase Dashboard → Authentication → Users
→ "Add user" (set email + password manually, no signup flow needed per your locked decision).

Then, back in SQL Editor, run (replacing the UUIDs with the ones Supabase generated):

```sql
insert into profiles (id, name, email, role) values
  ('<admin-user-uuid-from-dashboard>', 'Your Name', 'admin@toyscorner.com', 'Admin'),
  ('<staff-user-uuid-from-dashboard>', 'Staff Name', 'staff@toyscorner.com', 'Staff');
```

## Manual verification checklist (do this before writing any frontend code)

Run each of these directly in SQL Editor and confirm the result — this is the Phase 3
checkpoint from the build guide, made concrete:

**1. Purchase increases stock**
```sql
insert into purchase_entries (product_id, purchase_price, qty, supplier, bill_number)
values ('22222222-2222-2222-2222-222222222222', 220, 10, 'ABC Traders', 'BILL-001');

select product_name, current_stock from products where id = '22222222-2222-2222-2222-222222222222';
-- Building Blocks Set should now show 13 (was 3, +10)
```

**2. Sale decreases stock, allows going negative, flags backorder**
```sql
-- Barbie Doll starts at 0 stock. Sell 2 anyway (allowed per your locked decision):
insert into sales (invoice_no, customer_id, subtotal, grand_total, payment_method)
values ('INV-001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 698, 698, 'Cash')
returning id;
-- copy the returned id, use it below:

insert into sale_items (sale_id, product_id, qty, price, total)
values ('<sale-id-from-above>', '33333333-3333-3333-3333-333333333333', 2, 349, 698);

select product_name, current_stock from products where id = '33333333-3333-3333-3333-333333333333';
-- should show -2

select is_backorder from sale_items where sale_id = '<sale-id-from-above>';
-- should show true
```

**3. Purchase entry corrects the negative stock**
```sql
insert into purchase_entries (product_id, purchase_price, qty, supplier)
values ('33333333-3333-3333-3333-333333333333', 180, 10, 'XYZ Toys Supply');

select current_stock from products where id = '33333333-3333-3333-3333-333333333333';
-- should show 8 (-2 + 10)
```

**4. Deleting a sale reverses stock**
```sql
delete from sales where invoice_no = 'INV-001';

select current_stock from products where id = '33333333-3333-3333-3333-333333333333';
-- should go back down by 2 (the cascade delete on sale_items fires the reversal trigger)

select * from activity_logs where table_name = 'sales' order by created_at desc limit 1;
-- should show the deleted row logged
```

**5. Customer ID auto-generates**
```sql
insert into customers (name, phone) values ('Test Customer', '9998887779');
select unique_customer_id from customers where phone = '9998887779';
-- should show TC000003 (continuing from the 2 seeded customers)
```

**6. RLS actually blocks anonymous access**
In SQL Editor this always runs as an elevated role, so it won't show RLS in effect.
To actually test it: from your frontend app (once Phase 2 login is wired to real Supabase
data), confirm that querying `products` while logged OUT returns nothing / an error, and
querying while logged in as either Admin or Staff returns full data.

## If something doesn't match

- Stock numbers wrong → check trigger fired: `select * from pg_trigger where tgrelid = 'products'::regclass;`
- RLS blocking everything even when logged in → confirm you're using the **anon key** in
  the frontend (not service_role), and that the user actually has a session
  (`supabase.auth.getSession()` returns non-null).
