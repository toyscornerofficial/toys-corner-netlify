import { supabase } from './supabaseClient';

/**
 * Tables cleared by Factory Reset, in FK-safe delete order (children before
 * parents). Deliberately does NOT touch `settings` or `profiles` — wiping
 * business configuration or user/role records on a "clear my data" action
 * would be surprising and could lock the Admin out of their own settings.
 * This is scoped to operational data only.
 */
const RESET_TABLES_IN_ORDER = [
  'sale_items',
  'sales',
  'purchase_entries',
  'expenses',
  'inquiries',
  'customers',
  'products',
  'activity_logs',
];

/**
 * Deletes all rows from the tables above, then inserts 2 reference sample
 * records each for products and customers — enough that the app isn't
 * totally empty afterward, without pretending to be "real" seed data.
 */
export async function factoryReset() {
  const deletedCounts = {};

  for (const table of RESET_TABLES_IN_ORDER) {
    // Supabase requires a filter on delete-all; this matches every row
    // regardless of id type since all these tables use uuid primary keys.
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .not('id', 'is', null);
    if (error) throw new Error(`Failed clearing ${table}: ${error.message}`);
    deletedCounts[table] = count ?? 0;
  }

  // Reseed 2 reference products
  const { data: products, error: productError } = await supabase
    .from('products')
    .insert([
      {
        product_name: 'Sample Toy Car',
        barcode: 'SAMPLE0001',
        category: 'Toys',
        purchase_price: 100,
        selling_price: 199,
        current_stock: 10,
        minimum_stock: 5,
        status: 'active',
      },
      {
        product_name: 'Sample Puzzle Set',
        barcode: 'SAMPLE0002',
        category: 'Puzzles',
        purchase_price: 80,
        selling_price: 149,
        current_stock: 10,
        minimum_stock: 5,
        status: 'active',
      },
    ])
    .select();
  if (productError) throw new Error(`Failed reseeding products: ${productError.message}`);

  // Reseed 2 reference customers (unique_customer_id auto-generates via trigger)
  const { data: customers, error: customerError } = await supabase
    .from('customers')
    .insert([
      { name: 'Sample Customer One', phone: '9000000001' },
      { name: 'Sample Customer Two', phone: '9000000002' },
    ])
    .select();
  if (customerError) throw new Error(`Failed reseeding customers: ${customerError.message}`);

  return {
    deletedCounts,
    reseeded: {
      products: products?.length ?? 0,
      customers: customers?.length ?? 0,
    },
  };
}
