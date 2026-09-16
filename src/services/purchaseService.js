import { supabase } from './supabaseClient';

/**
 * Purchase entries with optional date range + pagination. Reused by both
 * the Purchases page's recent-entries list and the Phase 10 Purchase Report.
 */
export async function getPurchaseEntries({ start, end, search, page = 1, pageSize = 20 } = {}) {
  let query = supabase
    .from('purchase_entries')
    .select('*, products!inner(product_name)', { count: 'exact' });

  if (start) query = query.gte('date', start);
  if (end) query = query.lte('date', end);
  if (search?.trim()) {
    const term = search.trim();
    // Searches supplier, bill number, AND the linked product's name — the
    // product name match requires the !inner join above so PostgREST can
    // filter on that embedded column.
    query = query.or(`supplier.ilike.%${term}%,bill_number.ilike.%${term}%,products.product_name.ilike.%${term}%`);
  }

  query = query.order('date', { ascending: false }).order('created_at', { ascending: false });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

/**
 * Creates a purchase entry. The 0002_stock_triggers.sql trigger picks this
 * up automatically and increases products.current_stock — no manual stock
 * update needed here.
 */
export async function createPurchaseEntry(entry) {
  const { data, error } = await supabase.from('purchase_entries').insert(entry).select().single();
  if (error) throw error;
  return data;
}

export async function updatePurchaseEntry(id, updates) {
  const { data, error } = await supabase.from('purchase_entries').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePurchaseEntry(id) {
  const { error } = await supabase.from('purchase_entries').delete().eq('id', id);
  if (error) throw error;
}
