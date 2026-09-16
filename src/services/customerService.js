import { supabase } from './supabaseClient';

/** Paginated, searchable customer list — used by the Customers page and Customer Report. */
export async function getCustomers({ search = '', start, end, page = 1, pageSize = 10 } = {}) {
  let query = supabase.from('customers').select('*', { count: 'exact' });

  if (search.trim()) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,unique_customer_id.ilike.%${search}%`);
  }
  if (start) query = query.gte('created_at', start);
  if (end) query = query.lte('created_at', `${end}T23:59:59`);

  query = query.order('created_at', { ascending: false });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export async function searchCustomers(query) {
  if (!query || query.trim().length < 2) return [];

  const { data, error } = await supabase
    .from('customers')
    .select('id, unique_customer_id, name, phone')
    .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(10);

  if (error) throw error;
  return data ?? [];
}

/** Full customer list (just id/name/phone) for the WhatsApp broadcast queue — no pagination needed here. */
export async function getAllCustomersForBroadcast() {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone')
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createCustomer(customer) {
  const { data, error } = await supabase.from('customers').insert(customer).select().single();
  if (error) throw error;
  return data;
}

export async function updateCustomer(id, updates) {
  const { data, error } = await supabase.from('customers').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCustomer(id) {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw error;
}

export async function getCustomerPurchaseHistory(customerId) {
  const { data, error } = await supabase
    .from('sales')
    .select('id, invoice_no, date, grand_total, payment_method')
    .eq('customer_id', customerId)
    .order('date', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
