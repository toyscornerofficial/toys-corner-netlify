import { supabase } from './supabaseClient';

/** Search active products by name or barcode, for POS product search / barcode scan. */
export async function searchProductsForSale(query) {
  if (!query || query.trim().length === 0) return [];

  const { data, error } = await supabase
    .from('products')
    .select('id, product_name, barcode, selling_price, current_stock, image, discount, discount_type, offer')
    .eq('status', 'active')
    .or(`product_name.ilike.%${query}%,barcode.ilike.%${query}%`)
    .limit(15);

  if (error) throw error;
  return data ?? [];
}

/** Full active product list for the "Browse All Products" picker — no search term needed. */
export async function getAllProductsForSale() {
  const { data, error } = await supabase
    .from('products')
    .select('id, product_name, barcode, selling_price, current_stock, image, category, discount, discount_type, offer')
    .eq('status', 'active')
    .order('product_name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Exact barcode lookup — used when a barcode scanner fires an Enter keypress. */
export async function findProductByBarcode(barcode) {
  const { data, error } = await supabase
    .from('products')
    .select('id, product_name, barcode, selling_price, current_stock, image, discount, discount_type, offer')
    .eq('barcode', barcode)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Creates a sale + all its line items atomically via the fn_create_sale RPC.
 * items: [{ product_id, qty, price, discount }]
 */
export async function createSale({ customerId, paymentMethod, discount, discountType, discountValue, notes, items }) {
  const { data, error } = await supabase.rpc('fn_create_sale', {
    p_customer_id: customerId || null,
    p_payment_method: paymentMethod,
    p_discount: discount || 0,
    p_notes: notes || null,
    p_items: items.map((i) => ({
      product_id: i.product_id,
      qty: i.qty,
      price: i.price,
      discount: i.discount || 0,
      selected_batch_id: i.selectedBatchId || null,
    })),
    p_discount_type: discountType || 'flat',
    p_discount_value: discountValue || 0,
  });

  if (error) throw error;
  return data[0]; // { sale_id, invoice_no }
}

/**
 * Sales list with optional date range + pagination. Reused by both the
 * Sales page's "Recent Sales" history and the Phase 10 Sales Report.
 */
export async function getSales({ start, end, search, paymentMethod, page = 1, pageSize = 15 } = {}) {
  let query = supabase.from('sales').select('*, customers(name, phone)', { count: 'exact' });

  if (start) query = query.gte('date', start);
  if (end) query = query.lte('date', end);
  if (search?.trim()) query = query.ilike('invoice_no', `%${search.trim()}%`);
  if (paymentMethod) query = query.eq('payment_method', paymentMethod);

  query = query.order('date', { ascending: false }).order('created_at', { ascending: false });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

/** Full sale detail (header + line items + customer) for the invoice print view. */
/**
 * Just the item names + qty for one sale (no full sale/customer detail) —
 * used by the Recent Sales list's expandable row so item names load only
 * when a cashier actually opens that row, not for every row up front.
 */
export async function getSaleItemsSummary(saleId) {
  const { data, error } = await supabase
    .from('sale_items')
    .select('id, qty, products(product_name)')
    .eq('sale_id', saleId);

  if (error) throw error;
  return (data ?? []).map((i) => ({ id: i.id, qty: i.qty, name: i.products?.product_name ?? 'Unknown' }));
}

/**
 * Same as getSaleItemsSummary but for many sales in one query — used by
 * Reports' Sales tab, which needs an item list for every row on the page
 * (and for the full exported dataset), not just one row at a time like the
 * Sales page's lazy per-row expand.
 */
export async function getSaleItemsForSales(saleIds) {
  if (!saleIds || saleIds.length === 0) return {};

  const { data, error } = await supabase
    .from('sale_items')
    .select('sale_id, qty, products(product_name)')
    .in('sale_id', saleIds);

  if (error) throw error;

  const map = {};
  for (const row of data ?? []) {
    const name = row.products?.product_name ?? 'Unknown';
    if (!map[row.sale_id]) map[row.sale_id] = [];
    map[row.sale_id].push({ name, qty: row.qty });
  }
  return map;
}

export async function getSaleWithItems(saleId) {
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .select('*, customers(name, phone, unique_customer_id)')
    .eq('id', saleId)
    .single();
  if (saleError) throw saleError;

  const { data: items, error: itemsError } = await supabase
    .from('sale_items')
    .select('*, products(product_name)')
    .eq('sale_id', saleId);
  if (itemsError) throw itemsError;

  return { sale, items: items ?? [] };
}

/**
 * Updates a sale's non-item fields only (customer, payment method, discount,
 * notes). Deliberately does NOT support editing line items/quantities —
 * those drive the stock triggers, and editing them safely would need the
 * same kind of delta-aware trigger we added for Purchase Entries, applied
 * per line item with product-swap handling. For a wrong-item correction,
 * delete the sale (which cleanly reverses its stock via cascade) and
 * re-enter it via New Sale instead.
 *
 * Note: if discount changes here, grand_total is recalculated from the
 * sale's existing subtotal — the subtotal itself only changes if items change.
 */
export async function updateSaleDetails(saleId, { customerId, paymentMethod, discount, notes }) {
  const { data: existing, error: fetchError } = await supabase
    .from('sales')
    .select('subtotal')
    .eq('id', saleId)
    .single();
  if (fetchError) throw fetchError;

  const grandTotal = Number(existing.subtotal) - Number(discount || 0);

  const { data, error } = await supabase
    .from('sales')
    .update({
      customer_id: customerId || null,
      payment_method: paymentMethod,
      discount: discount || 0,
      grand_total: grandTotal,
      notes: notes || null,
    })
    .eq('id', saleId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Order count + total amount per payment method (Cash/UPI/Card) within a
 * date range. Used by the Sales page (today's breakdown) and the Reports
 * Sales tab (breakdown for whatever range is selected).
 */
export async function getPaymentMethodBreakdown(start, end) {
  let query = supabase.from('sales').select('payment_method, grand_total');
  if (start) query = query.gte('date', start);
  if (end) query = query.lte('date', end);

  const { data, error } = await query;
  if (error) throw error;

  const breakdown = {
    Cash: { count: 0, total: 0 },
    UPI: { count: 0, total: 0 },
    Card: { count: 0, total: 0 },
  };

  for (const row of data ?? []) {
    if (breakdown[row.payment_method]) {
      breakdown[row.payment_method].count += 1;
      breakdown[row.payment_method].total += Number(row.grand_total);
    }
  }

  return breakdown;
}

export async function deleteSale(saleId) {
  // Cascades to sale_items (on delete cascade) which reverses stock per item,
  // and is logged in activity_logs via the 0004 trigger.
  const { error } = await supabase.from('sales').delete().eq('id', saleId);
  if (error) throw error;
}
