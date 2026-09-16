import { supabase } from './supabaseClient';

/**
 * Filtered, paginated expense list. Filtering and pagination happen in the
 * query itself (not client-side) so this stays fast as the table grows —
 * important since expenses accumulate indefinitely with no natural cap.
 */
export async function getExpenses({ start, end, category, search, page = 1, pageSize = 10 } = {}) {
  let query = supabase.from('expenses').select('*', { count: 'exact' });

  if (start) query = query.gte('date', start);
  if (end) query = query.lte('date', end);
  if (category) query = query.eq('category', category);
  if (search?.trim()) query = query.or(`title.ilike.%${search.trim()}%,note.ilike.%${search.trim()}%`);

  query = query
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export async function createExpense(expense) {
  const { data, error } = await supabase.from('expenses').insert(expense).select().single();
  if (error) throw error;
  return data;
}

export async function updateExpense(id, updates) {
  const { data, error } = await supabase.from('expenses').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Sum of expenses in a date range, independent of the paginated list above.
 * Used for the Today's/This Month summary cards, which must stay accurate
 * regardless of which page or date filter the table itself is showing.
 */
export async function getExpenseTotal(start, end) {
  const { data, error } = await supabase
    .from('expenses')
    .select('amount')
    .gte('date', start)
    .lte('date', end);

  if (error) throw error;
  return (data ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
}
