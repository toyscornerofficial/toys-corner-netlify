import { supabase } from './supabaseClient';
import { getISTDateString, getISTMonthRange, getLastNDaysIST, getLastNMonthsIST } from '../utils/dateHelpers';

/**
 * All queries a dashboard/report needs, kept in one place so Phase 10 (Reports)
 * can reuse these exact functions instead of re-writing the aggregation logic.
 */

// ---------- Today's KPI cards ----------
export async function getTodayStats() {
  const today = getISTDateString();

  const [salesRes, expensesRes] = await Promise.all([
    supabase.from('sales').select('id, customer_id, grand_total').eq('date', today),
    supabase.from('expenses').select('amount').eq('date', today),
  ]);

  if (salesRes.error) throw salesRes.error;
  if (expensesRes.error) throw expensesRes.error;

  const sales = salesRes.data ?? [];
  const expenses = expensesRes.data ?? [];

  const totalSales = sales.reduce((sum, s) => sum + Number(s.grand_total), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const uniqueCustomers = new Set(sales.filter((s) => s.customer_id).map((s) => s.customer_id));

  // Sold qty needs sale_items joined to today's sale ids
  const saleIds = sales.map((s) => s.id);
  let soldQty = 0;
  if (saleIds.length > 0) {
    const { data: items, error } = await supabase
      .from('sale_items')
      .select('qty')
      .in('sale_id', saleIds);
    if (error) throw error;
    soldQty = (items ?? []).reduce((sum, i) => sum + Number(i.qty), 0);
  }

  return {
    sales: totalSales,
    expenses: totalExpenses,
    profit: totalSales - totalExpenses, // simple P&L; refined margin calc can come later in Reports
    orders: sales.length,
    customers: uniqueCustomers.size,
    soldQty,
  };
}

// ---------- Monthly KPI cards ----------
export async function getMonthStats() {
  const { start, end } = getISTMonthRange();

  const [salesRes, expensesRes, productsRes] = await Promise.all([
    supabase.from('sales').select('grand_total').gte('date', start).lte('date', end),
    supabase.from('expenses').select('amount').gte('date', start).lte('date', end),
    supabase.from('products').select('current_stock, purchase_price'),
  ]);

  if (salesRes.error) throw salesRes.error;
  if (expensesRes.error) throw expensesRes.error;
  if (productsRes.error) throw productsRes.error;

  const totalSales = (salesRes.data ?? []).reduce((sum, s) => sum + Number(s.grand_total), 0);
  const totalExpenses = (expensesRes.data ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const totalStockValue = (productsRes.data ?? []).reduce(
    (sum, p) => sum + Math.max(Number(p.current_stock), 0) * Number(p.purchase_price),
    0
  );

  return {
    sales: totalSales,
    expenses: totalExpenses,
    profit: totalSales - totalExpenses,
    stockValue: totalStockValue,
  };
}

// ---------- Alerts: low stock, negative stock, pending inquiries ----------
export async function getLowStockProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, product_name, current_stock, minimum_stock')
    .gte('current_stock', 0) // separate from negative stock — this is "low but not owed"
    .order('current_stock', { ascending: true });

  if (error) throw error;
  return (data ?? []).filter((p) => p.current_stock <= p.minimum_stock);
}

export async function getNegativeStockProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, product_name, current_stock')
    .lt('current_stock', 0)
    .order('current_stock', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getPendingInquiryCount() {
  const { count, error } = await supabase
    .from('inquiries')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'Pending');

  if (error) throw error;
  return count ?? 0;
}

// ---------- Charts ----------
export async function getDailySalesSeries(days = 7) {
  const dateKeys = getLastNDaysIST(days);
  const { data, error } = await supabase
    .from('sales')
    .select('date, grand_total')
    .gte('date', dateKeys[0])
    .lte('date', dateKeys[dateKeys.length - 1]);

  if (error) throw error;

  const totals = Object.fromEntries(dateKeys.map((d) => [d, 0]));
  for (const row of data ?? []) {
    totals[row.date] = (totals[row.date] ?? 0) + Number(row.grand_total);
  }

  return {
    labels: dateKeys.map((d) => d.slice(5)), // MM-DD for compact axis labels
    values: dateKeys.map((d) => totals[d]),
  };
}

export async function getMonthlySalesSeries(months = 6) {
  const monthKeys = getLastNMonthsIST(months);
  const startDate = monthKeys[0].key + '-01';

  const { data, error } = await supabase
    .from('sales')
    .select('date, grand_total')
    .gte('date', startDate);

  if (error) throw error;

  const totals = Object.fromEntries(monthKeys.map((m) => [m.key, 0]));
  for (const row of data ?? []) {
    const key = row.date.slice(0, 7); // 'YYYY-MM'
    if (key in totals) totals[key] += Number(row.grand_total);
  }

  return {
    labels: monthKeys.map((m) => m.label),
    values: monthKeys.map((m) => totals[m.key]),
  };
}

export async function getExpenseSeries(months = 6) {
  const monthKeys = getLastNMonthsIST(months);
  const startDate = monthKeys[0].key + '-01';

  const { data, error } = await supabase
    .from('expenses')
    .select('date, amount')
    .gte('date', startDate);

  if (error) throw error;

  const totals = Object.fromEntries(monthKeys.map((m) => [m.key, 0]));
  for (const row of data ?? []) {
    const key = row.date.slice(0, 7);
    if (key in totals) totals[key] += Number(row.amount);
  }

  return {
    labels: monthKeys.map((m) => m.label),
    values: monthKeys.map((m) => totals[m.key]),
  };
}

export async function getTopSellingProducts(limit = 5) {
  // Bounded to the current month — scanning the ENTIRE sale_items table on
  // every dashboard load (no date filter at all) is a real scaling problem
  // that only gets slower as sales history grows. "Top sellers this month"
  // is also just a more useful figure for a daily dashboard than all-time.
  const { start, end } = getISTMonthRange();

  const { data, error } = await supabase
    .from('sale_items')
    .select('qty, products(product_name), sales!inner(date)')
    .gte('sales.date', start)
    .lte('sales.date', end);

  if (error) throw error;

  const totals = {};
  for (const row of data ?? []) {
    const name = row.products?.product_name ?? 'Unknown';
    totals[name] = (totals[name] ?? 0) + Number(row.qty);
  }

  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, qty]) => ({ name, qty }));
}
