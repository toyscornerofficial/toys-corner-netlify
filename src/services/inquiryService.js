import { supabase } from './supabaseClient';

const STATUSES = ['Pending', 'Ordered', 'Available', 'Called', 'Completed', 'Cancelled'];

export async function getInquiries({ status = '', search = '', start, end, page = 1, pageSize = 10 } = {}) {
  let query = supabase.from('inquiries').select('*', { count: 'exact' });

  if (status) query = query.eq('status', status);
  if (search.trim()) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,required_product.ilike.%${search}%`);
  }
  if (start) query = query.gte('date', start);
  if (end) query = query.lte('date', end);

  query = query.order('date', { ascending: false }).order('created_at', { ascending: false });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export async function createInquiry(inquiry) {
  const { data, error } = await supabase.from('inquiries').insert(inquiry).select().single();
  if (error) throw error;
  return data;
}

export async function updateInquiry(id, updates) {
  const { data, error } = await supabase.from('inquiries').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function updateInquiryStatus(id, status) {
  return updateInquiry(id, { status });
}

export async function deleteInquiry(id) {
  const { error } = await supabase.from('inquiries').delete().eq('id', id);
  if (error) throw error;
}

export { STATUSES };
