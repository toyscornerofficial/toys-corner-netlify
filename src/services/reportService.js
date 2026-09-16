import { supabase } from './supabaseClient';

/** Sales Report summary: totals across the whole range, not just the visible page. */
export async function getSalesReportSummary(start, end) {
  const { data, error } = await supabase
    .from('sales')
    .select('grand_total, subtotal, discount')
    .gte('date', start)
    .lte('date', end);
  if (error) throw error;

  const rows = data ?? [];
  return {
    totalOrders: rows.length,
    totalSales: rows.reduce((sum, r) => sum + Number(r.grand_total), 0),
    totalDiscount: rows.reduce((sum, r) => sum + Number(r.discount), 0),
  };
}

/** Expense Report summary: total + breakdown by category. */
export async function getExpenseReportSummary(start, end) {
  const { data, error } = await supabase
    .from('expenses')
    .select('amount, category')
    .gte('date', start)
    .lte('date', end);
  if (error) throw error;

  const rows = data ?? [];
  const byCategory = {};
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + Number(r.amount);
  }

  return {
    totalExpense: rows.reduce((sum, r) => sum + Number(r.amount), 0),
    byCategory: Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([category, total]) => ({ category, total })),
  };
}

/** Profit Report summary: sales - expenses across the range. */
export async function getProfitReportSummary(start, end) {
  const [salesRes, expensesRes] = await Promise.all([
    supabase.from('sales').select('grand_total').gte('date', start).lte('date', end),
    supabase.from('expenses').select('amount').gte('date', start).lte('date', end),
  ]);
  if (salesRes.error) throw salesRes.error;
  if (expensesRes.error) throw expensesRes.error;

  const totalSales = (salesRes.data ?? []).reduce((sum, r) => sum + Number(r.grand_total), 0);
  const totalExpenses = (expensesRes.data ?? []).reduce((sum, r) => sum + Number(r.amount), 0);

  return { totalSales, totalExpenses, profit: totalSales - totalExpenses };
}

/** Purchase Report summary: total qty purchased + total cost across the range. */
export async function getPurchaseReportSummary(start, end) {
  const { data, error } = await supabase
    .from('purchase_entries')
    .select('qty, purchase_price')
    .gte('date', start)
    .lte('date', end);
  if (error) throw error;

  const rows = data ?? [];
  return {
    totalQty: rows.reduce((sum, r) => sum + Number(r.qty), 0),
    totalCost: rows.reduce((sum, r) => sum + Number(r.qty) * Number(r.purchase_price), 0),
    totalEntries: rows.length,
  };
}

/** Stock Report summary: a current-state snapshot, not date-ranged (stock has no "which week" concept). */
export async function getStockReportSummary() {
  const { data, error } = await supabase.from('products').select('current_stock, minimum_stock, purchase_price');
  if (error) throw error;

  const rows = data ?? [];
  return {
    totalProducts: rows.length,
    totalStockValue: rows.reduce((sum, p) => sum + Math.max(Number(p.current_stock), 0) * Number(p.purchase_price), 0),
    lowStockCount: rows.filter((p) => p.current_stock >= 0 && p.current_stock <= p.minimum_stock).length,
    negativeStockCount: rows.filter((p) => p.current_stock < 0).length,
  };
}

/** Customer Report summary: new signups in range vs. total customers overall. */
export async function getCustomerReportSummary(start, end) {
  const [newRes, totalRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start)
      .lte('created_at', `${end}T23:59:59`),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
  ]);
  if (newRes.error) throw newRes.error;
  if (totalRes.error) throw totalRes.error;

  return { newCustomers: newRes.count ?? 0, totalCustomers: totalRes.count ?? 0 };
}

/** Inquiry Report summary: counts grouped by status within the range. */
export async function getInquiryReportSummary(start, end) {
  const { data, error } = await supabase
    .from('inquiries')
    .select('status')
    .gte('date', start)
    .lte('date', end);
  if (error) throw error;

  const rows = data ?? [];
  const byStatus = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  return { total: rows.length, byStatus };
}
