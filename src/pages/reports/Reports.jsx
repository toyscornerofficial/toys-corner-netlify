import { useEffect, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import { useAuth } from '../../context/AuthContext';
import DateRangeFilter, { computeRangeForPreset } from '../../components/ui/DateRangeFilter';
import Pagination from '../../components/ui/Pagination';

import { getSales, getPaymentMethodBreakdown, getSaleItemsForSales } from '../../services/salesService';
import { getExpenses } from '../../services/expenseService';
import { getPurchaseEntries } from '../../services/purchaseService';
import { getProducts } from '../../services/productService';
import { getCustomers } from '../../services/customerService';
import { getInquiries, STATUSES as INQUIRY_STATUSES } from '../../services/inquiryService';
import PaymentBreakdownCards from '../../components/sales/PaymentBreakdownCards';
import {
  getSalesReportSummary,
  getExpenseReportSummary,
  getProfitReportSummary,
  getPurchaseReportSummary,
  getStockReportSummary,
  getCustomerReportSummary,
  getInquiryReportSummary,
} from '../../services/reportService';

import { formatCurrency, formatDateIST, getISTDateString, formatDiscountLabel } from '../../utils/dateHelpers';
import { exportReportToPdf, exportReportToExcel, buildReportFilename, formatCurrencyPdf } from '../../utils/reportExport';

const DEFAULT_PAGE_SIZE = 10;

/** "Item A" for one item, "Item A +2 more" for multiple — same convention as the Sales page's Recent Sales. */
function buildItemsLabel(items) {
  if (!items || items.length === 0) return '—';
  if (items.length === 1) return items[0].name;
  return `${items[0].name} +${items.length - 1} more`;
}

const TABS = [
  { key: 'sales', label: 'Sales', icon: 'fa-receipt' },
  { key: 'expense', label: 'Expense', icon: 'fa-wallet' },
  { key: 'profit', label: 'Profit', icon: 'fa-chart-line', adminOnly: true },
  { key: 'purchase', label: 'Purchase', icon: 'fa-truck', adminOnly: true },
  { key: 'stock', label: 'Stock', icon: 'fa-boxes-stacked', adminOnly: true },
  { key: 'customer', label: 'Customer', icon: 'fa-users' },
  { key: 'inquiry', label: 'Inquiry', icon: 'fa-circle-question' },
];

// Column definitions per report — shared between the on-screen table and PDF/Excel export
const COLUMNS = {
  sales: [
    { header: 'Invoice No', key: 'invoice_no' },
    { header: 'Customer', key: 'customer' },
    { header: 'Items', key: 'itemsLabel' },
    { header: 'Date', key: 'dateLabel' },
    { header: 'Payment', key: 'payment_method' },
    { header: 'Subtotal', key: 'subtotalLabel' },
    { header: 'Discount', key: 'discountLabel' },
    { header: 'Grand Total', key: 'grandTotalLabel' },
  ],
  expense: [
    { header: 'Title', key: 'title' },
    { header: 'Category', key: 'category' },
    { header: 'Amount', key: 'amountLabel' },
    { header: 'Date', key: 'dateLabel' },
    { header: 'Note', key: 'note' },
  ],
  purchase: [
    { header: 'Product', key: 'productName' },
    { header: 'Qty', key: 'qty' },
    { header: 'Purchase Price', key: 'priceLabel' },
    { header: 'Supplier', key: 'supplier' },
    { header: 'Bill Number', key: 'bill_number' },
    { header: 'Date', key: 'dateLabel' },
  ],
  stock: [
    { header: 'Product', key: 'product_name' },
    { header: 'Category', key: 'category' },
    { header: 'Current Stock', key: 'current_stock' },
    { header: 'Minimum Stock', key: 'minimum_stock' },
    { header: 'Stock Value', key: 'stockValueLabel' },
  ],
  customer: [
    { header: 'Customer ID', key: 'unique_customer_id' },
    { header: 'Name', key: 'name' },
    { header: 'Phone', key: 'phone' },
    { header: 'Joined', key: 'joinedLabel' },
  ],
  inquiry: [
    { header: 'Name', key: 'name' },
    { header: 'Phone', key: 'phone' },
    { header: 'Product', key: 'required_product' },
    { header: 'Status', key: 'status' },
    { header: 'Date', key: 'dateLabel' },
  ],
};

// jsPDF's built-in font has no ₹ glyph (renders as a garbled/superscript
// artifact), so PDF export needs "Rs."-formatted values recomputed from the
// raw numeric fields, rather than reusing the ₹-formatted labels shown on
// screen and used in the Excel export (Excel/browsers render ₹ fine).
const PDF_CURRENCY_RECOMPUTE = {
  sales: (row) => ({
    subtotalLabel: formatCurrencyPdf(row.subtotal),
    discountLabel:
      row.discount_type === 'percent'
        ? `${row.discount_value}% (${formatCurrencyPdf(row.discount)})`
        : formatCurrencyPdf(row.discount),
    grandTotalLabel: formatCurrencyPdf(row.grand_total),
  }),
  expense: (row) => ({
    amountLabel: formatCurrencyPdf(row.amount),
  }),
  purchase: (row) => ({
    priceLabel: formatCurrencyPdf(row.purchase_price),
  }),
  stock: (row) => ({
    stockValueLabel: formatCurrencyPdf(Math.max(row.current_stock, 0) * row.purchase_price),
  }),
};

const EXPENSE_CATEGORIES = ['Electricity', 'Rent', 'Salary', 'Transport', 'Tea', 'Maintenance', 'Other'];

const SEARCH_PLACEHOLDERS = {
  sales: 'Search invoice no...',
  expense: 'Search title or note...',
  purchase: 'Search supplier or bill no...',
  stock: 'Search product or barcode...',
  customer: 'Search name, phone, ID...',
  inquiry: 'Search name, phone, product...',
};

// Per-row action buttons, kept OUT of COLUMNS deliberately — COLUMNS drives
// both the on-screen table and PDF/Excel export, and these icon buttons
// have no place in an exported file.
const ROW_ACTIONS = {
  sales: (row, navigate) => (
    <>
      <button
        className="btn btn-sm btn-light me-1"
        title="Download PDF"
        onClick={() => navigate(`/sales/invoice/${row.id}?action=pdf`)}
      >
        <i className="fa-solid fa-file-arrow-down" />
      </button>
      <button
        className="btn btn-sm btn-light me-1"
        title="Print Invoice (A5)"
        onClick={() => navigate(`/sales/invoice/${row.id}?action=invoice`)}
      >
        <i className="fa-solid fa-print" />
      </button>
      <button
        className="btn btn-sm btn-light"
        title="Print Receipt (80mm)"
        onClick={() => navigate(`/sales/invoice/${row.id}?action=receipt`)}
      >
        <i className="fa-solid fa-receipt" />
      </button>
    </>
  ),
  purchase: (row, navigate) => (
    <button
      className="btn btn-sm btn-light"
      title="Go to Purchase Entry"
      onClick={() => navigate(`/purchases?highlight=${row.id}`)}
    >
      <i className="fa-solid fa-arrow-up-right-from-square" />
    </button>
  ),
  stock: (row, navigate) => (
    <button
      className="btn btn-sm btn-light"
      title="Go to Stock"
      onClick={() => navigate(`/stock?q=${encodeURIComponent(row.product_name)}`)}
    >
      <i className="fa-solid fa-arrow-up-right-from-square" />
    </button>
  ),
  customer: (row, navigate) => (
    <button
      className="btn btn-sm btn-light"
      title="Go to Customers"
      onClick={() => navigate(`/customers?q=${encodeURIComponent(row.unique_customer_id || row.phone)}`)}
    >
      <i className="fa-solid fa-arrow-up-right-from-square" />
    </button>
  ),
};

export default function Reports() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('sales');
  const [range, setRange] = useState({ preset: 'this_month', ...computeRangeForPreset('this_month') });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [expandedSaleId, setExpandedSaleId] = useState(null);
  const [saleItemsMap, setSaleItemsMap] = useState({});
  const [exporting, setExporting] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState('');
  const [inquiryStatus, setInquiryStatus] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState('');
  const [paymentBreakdown, setPaymentBreakdown] = useState(null);

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  // Safety net: if the active tab isn't visible for this role (e.g. Staff
  // had a report open when their session loaded, or the URL was shared),
  // fall back to Sales rather than silently showing Admin-only data.
  useEffect(() => {
    if (isAdmin === undefined) return; // role still loading
    if (!visibleTabs.some((t) => t.key === activeTab)) {
      setActiveTab('sales');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const usesDateRange = true; // all tabs now share the date filter — Stock filters by date-added (see fetchTabRows)

  /**
   * Fetches + transforms rows for whatever tab is currently active, for a
   * GIVEN page/pageSize. Used two ways:
   *  - by load(), with the real page/pageSize state, for on-screen display
   *  - by the export handlers, with page=1 and a very large pageSize, to
   *    get EVERY row matching the current filters — not just the one page
   *    visible on screen. Exporting only `rows` (the paginated state) was
   *    the bug: PDF/Excel/Print only ever contained the current page.
   */
  const fetchTabRows = async (pageArg, pageSizeArg) => {
    const { start, end } = range;

    if (activeTab === 'sales') {
      const { data, count } = await getSales({
        start, end, search: reportSearch, paymentMethod: salesPaymentFilter || undefined,
        page: pageArg, pageSize: pageSizeArg,
      });
      const itemsMap = await getSaleItemsForSales(data.map((s) => s.id));
      const rows = data.map((s) => ({
        ...s,
        customer: s.customers?.name ?? 'Walk-in',
        itemsLabel: buildItemsLabel(itemsMap[s.id]),
        dateLabel: formatDateIST(s.date, 'DD MMM YYYY'),
        subtotalLabel: formatCurrency(s.subtotal),
        discountLabel: formatDiscountLabel(s),
        grandTotalLabel: formatCurrency(s.grand_total),
      }));
      return { rows, count, itemsMap };
    }

    if (activeTab === 'expense') {
      const { data, count } = await getExpenses({
        start, end, category: expenseCategory || undefined, search: reportSearch, page: pageArg, pageSize: pageSizeArg,
      });
      const rows = data.map((e) => ({ ...e, amountLabel: formatCurrency(e.amount), dateLabel: formatDateIST(e.date, 'DD MMM YYYY') }));
      return { rows, count };
    }

    if (activeTab === 'purchase') {
      const { data, count } = await getPurchaseEntries({ start, end, search: reportSearch, page: pageArg, pageSize: pageSizeArg });
      const rows = data.map((p) => ({
        ...p,
        productName: p.products?.product_name ?? '—',
        priceLabel: formatCurrency(p.purchase_price),
        dateLabel: formatDateIST(p.date, 'DD MMM YYYY'),
      }));
      return { rows, count };
    }

    if (activeTab === 'stock') {
      // Stock Report is a current-state snapshot (no server-side pagination
      // by design), so search, date-added filtering, and "pagination" all
      // happen client-side here. Date range filters by created_at (date
      // the product was added) — same convention as the standalone Stock
      // page — not by a sales-style transaction date, since stock itself
      // has no such date.
      const allProducts = await getProducts();
      let filtered = allProducts;

      if (start) filtered = filtered.filter((p) => p.created_at >= start);
      if (end) filtered = filtered.filter((p) => p.created_at <= `${end}T23:59:59`);
      if (reportSearch.trim()) {
        filtered = filtered.filter(
          (p) =>
            p.product_name.toLowerCase().includes(reportSearch.toLowerCase()) ||
            (p.barcode ?? '').includes(reportSearch)
        );
      }

      const from = (pageArg - 1) * pageSizeArg;
      const rows = filtered.slice(from, from + pageSizeArg).map((p) => ({
        ...p,
        stockValueLabel: formatCurrency(Math.max(p.current_stock, 0) * p.purchase_price),
      }));
      return { rows, count: filtered.length };
    }

    if (activeTab === 'customer') {
      const { data, count } = await getCustomers({ start, end, search: reportSearch, page: pageArg, pageSize: pageSizeArg });
      const rows = data.map((c) => ({ ...c, joinedLabel: formatDateIST(c.created_at, 'DD MMM YYYY') }));
      return { rows, count };
    }

    if (activeTab === 'inquiry') {
      const { data, count } = await getInquiries({
        start, end, status: inquiryStatus || undefined, search: reportSearch, page: pageArg, pageSize: pageSizeArg,
      });
      const rows = data.map((i) => ({ ...i, dateLabel: formatDateIST(i.date, 'DD MMM YYYY') }));
      return { rows, count };
    }

    return { rows: [], count: 0 };
  };

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { start, end } = range;

      if (activeTab === 'profit') {
        const sum = await getProfitReportSummary(start, end);
        setRows([]);
        setTotalCount(0);
        setSummary(sum);
        return;
      }

      const summaryPromise =
        activeTab === 'sales' ? getSalesReportSummary(start, end) :
        activeTab === 'expense' ? getExpenseReportSummary(start, end) :
        activeTab === 'purchase' ? getPurchaseReportSummary(start, end) :
        activeTab === 'stock' ? getStockReportSummary() :
        activeTab === 'customer' ? getCustomerReportSummary(start, end) :
        activeTab === 'inquiry' ? getInquiryReportSummary(start, end) :
        Promise.resolve(null);

      const [{ rows: fetchedRows, count, itemsMap }, sum] = await Promise.all([
        fetchTabRows(page, pageSize),
        summaryPromise,
      ]);

      setRows(fetchedRows);
      setTotalCount(count);
      setSummary(sum);

      if (activeTab === 'sales') {
        setSaleItemsMap(itemsMap || {});
        const breakdown = await getPaymentMethodBreakdown(start, end);
        setPaymentBreakdown(breakdown);
      }
    } catch (err) {
      console.error(err);
      setLoadError(err.message || 'Failed to load this report.');
      toast.error('Failed to load report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, range, page, pageSize, expenseCategory, inquiryStatus, reportSearch, salesPaymentFilter]);

  const handleTabChange = (key) => {
    setActiveTab(key);
    setPage(1);
    setReportSearch('');
  };

  const handleRangeChange = (newRange) => {
    setRange(newRange);
    setPage(1);
  };

  const handleExpenseCategoryChange = (value) => {
    setExpenseCategory(value);
    setPage(1);
  };

  const handleInquiryStatusChange = (value) => {
    setInquiryStatus(value);
    setPage(1);
  };

  const handleReportSearchChange = (value) => {
    setReportSearch(value);
    setPage(1);
  };

  const handleSalesPaymentFilterChange = (value) => {
    setSalesPaymentFilter(value);
    setPage(1);
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setPage(1);
  };

  const toggleSaleItemsExpand = (saleId) => {
    setExpandedSaleId((prev) => (prev === saleId ? null : saleId));
  };

  const dateRangeLabel = usesDateRange
    ? `${formatDateIST(range.start, 'DD MMM YYYY')} – ${formatDateIST(range.end, 'DD MMM YYYY')}`
    : `As of ${formatDateIST(getISTDateString(), 'DD MMM YYYY')}`;

  const reportTitle = TABS.find((t) => t.key === activeTab)?.label + ' Report';

  const handlePrint = async () => {
    // Profit has no row-level table (summary cards only) — those are
    // already fully visible on screen, so just print directly instead of
    // fetching "rows" that were never going to exist for this tab.
    if (activeTab === 'profit') {
      window.print();
      return;
    }

    setExporting(true);
    try {
      const { rows: fullRows, itemsMap } = await fetchTabRows(1, 100000);
      if (fullRows.length === 0) {
        toast.warn('Nothing to print for this range.');
        return;
      }

      // Temporarily show every matching row (not just the current page)
      // so what gets printed matches the selected date range, then revert
      // back to the normal paginated view once printing is done.
      const previousRows = rows;
      const previousItemsMap = saleItemsMap;
      setRows(fullRows);
      if (activeTab === 'sales') setSaleItemsMap(itemsMap || {});

      const restore = () => {
        setRows(previousRows);
        if (activeTab === 'sales') setSaleItemsMap(previousItemsMap);
        window.removeEventListener('afterprint', restore);
      };
      window.addEventListener('afterprint', restore);

      setTimeout(() => window.print(), 50);
    } catch (err) {
      console.error(err);
      toast.error('Failed to prepare print view.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      // Profit has no row-level table (summary only) — export its 3
      // summary figures directly instead of trying to export "rows" that
      // were never going to exist for this tab.
      if (activeTab === 'profit') {
        if (!summary) {
          toast.warn('Nothing to export for this range.');
          return;
        }
        exportReportToPdf({
          title: reportTitle,
          dateRangeLabel,
          columns: [{ header: 'Metric', key: 'metric' }, { header: 'Amount', key: 'value' }],
          rows: [
            { metric: 'Total Sales', value: formatCurrencyPdf(summary.totalSales) },
            { metric: 'Total Expenses', value: formatCurrencyPdf(summary.totalExpenses) },
            { metric: 'Net Profit', value: formatCurrencyPdf(summary.profit) },
          ],
          filename: buildReportFilename('Profit', range.start, range.end, 'pdf'),
        });
        return;
      }

      // Fetch EVERY row matching the current filters (date range, search,
      // status/category/payment filter) — not just the page currently on
      // screen. page=1, a very large pageSize effectively means "all".
      const { rows: fullRows } = await fetchTabRows(1, 100000);
      if (fullRows.length === 0) {
        toast.warn('Nothing to export for this range.');
        return;
      }

      // Rebuild currency-labeled fields with "Rs." instead of the ₹-formatted
      // labels used on screen — jsPDF's default font can't render ₹ cleanly.
      const recompute = PDF_CURRENCY_RECOMPUTE[activeTab];
      const pdfRows = recompute ? fullRows.map((r) => ({ ...r, ...recompute(r) })) : fullRows;

      // Sales PDF gets the Cash/UPI/Card breakdown as a proper aligned
      // mini-table below the main table, plus a right-aligned Grand Total line.
      const extraFooterTable =
        activeTab === 'sales' && paymentBreakdown
          ? {
            title: 'Payment Method Breakdown',
            columns: ['Method', 'Orders', 'Amount'],
            rows: Object.entries(paymentBreakdown).map(([method, data]) => [
              method,
              String(data.count),
              formatCurrencyPdf(data.total),
            ]),
          }
        : undefined;

    const grandTotalLine = activeTab === 'sales' && summary ? formatCurrencyPdf(summary.totalSales) : undefined;

      exportReportToPdf({
        title: reportTitle,
        dateRangeLabel,
        columns: COLUMNS[activeTab],
        rows: pdfRows,
        filename: buildReportFilename(TABS.find((t) => t.key === activeTab)?.label, range.start, range.end, 'pdf'),
        extraFooterTable,
        grandTotalLine,
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to export PDF.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      if (activeTab === 'profit') {
        if (!summary) {
          toast.warn('Nothing to export for this range.');
          return;
        }
        exportReportToExcel({
          sheetName: reportTitle,
          columns: [{ header: 'Metric', key: 'metric' }, { header: 'Amount', key: 'value' }],
          rows: [
            { metric: 'Total Sales', value: formatCurrency(summary.totalSales) },
            { metric: 'Total Expenses', value: formatCurrency(summary.totalExpenses) },
            { metric: 'Net Profit', value: formatCurrency(summary.profit) },
          ],
          filename: buildReportFilename('Profit', range.start, range.end, 'xlsx'),
        });
        return;
      }

      const { rows: fullRows } = await fetchTabRows(1, 100000);
      if (fullRows.length === 0) {
        toast.warn('Nothing to export for this range.');
        return;
      }

      // Sales export gets a "Final Total" row summing Grand Total down the
      // column — vertical total under the data, not a separate summary sheet.
      const totalsRow =
        activeTab === 'sales' && summary
          ? { 'Invoice No': 'Final Total', 'Grand Total': formatCurrency(summary.totalSales) }
          : undefined;

      // Sales export also gets Cash/UPI/Card breakdown as extra rows after
      // the totals row — each method's order count and amount on its own line.
      const extraRows =
        activeTab === 'sales' && paymentBreakdown
          ? Object.entries(paymentBreakdown).map(([method, data]) => ({
              'Invoice No': `${method} Orders`,
              Customer: String(data.count),
              'Grand Total': formatCurrency(data.total),
            }))
          : undefined;

      exportReportToExcel({
        sheetName: reportTitle,
        columns: COLUMNS[activeTab],
        rows: fullRows,
        filename: buildReportFilename(TABS.find((t) => t.key === activeTab)?.label, range.start, range.end, 'xlsx'),
        totalsRow,
        extraRows,
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to export Excel.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h4 className="fw-bold mb-4">Reports</h4>

      {/* Tabs */}
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${activeTab === t.key ? 'text-white' : 'btn-light'}`}
            style={activeTab === t.key ? { background: '#4F46E5' } : {}}
            onClick={() => handleTabChange(t.key)}
          >
            <i className={`fa-solid ${t.icon} me-1`} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter + export toolbar */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 d-print-none">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {usesDateRange ? (
            <>
              <DateRangeFilter value={range} onChange={handleRangeChange} />
              {activeTab === 'stock' && (
                <span className="text-secondary" style={{ fontSize: '0.72rem' }}>(filters by date added)</span>
              )}
            </>
          ) : (
            <div className="text-secondary small">{dateRangeLabel}</div>
          )}
          {activeTab !== 'profit' && (
            <input
              className="form-control form-control-sm"
              style={{ width: 200 }}
              placeholder={SEARCH_PLACEHOLDERS[activeTab] ?? 'Search...'}
              value={reportSearch}
              onChange={(e) => handleReportSearchChange(e.target.value)}
            />
          )}
          {activeTab === 'sales' && (
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={salesPaymentFilter}
              onChange={(e) => handleSalesPaymentFilterChange(e.target.value)}
            >
              <option value="">All Payment Methods</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
            </select>
          )}
          {activeTab === 'expense' && (
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={expenseCategory}
              onChange={(e) => handleExpenseCategoryChange(e.target.value)}
            >
              <option value="">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {activeTab === 'inquiry' && (
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={inquiryStatus}
              onChange={(e) => handleInquiryStatusChange(e.target.value)}
            >
              <option value="">All Statuses</option>
              {INQUIRY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={handlePrint} disabled={exporting}>
            <i className="fa-solid fa-print me-1" /> {exporting ? 'Preparing...' : 'Print'}
          </button>
          <button className="btn btn-sm btn-outline-primary" onClick={handleExportPdf} disabled={exporting}>
            <i className="fa-solid fa-file-pdf me-1" /> PDF
          </button>
          <button className="btn btn-sm btn-outline-success" onClick={handleExportExcel} disabled={exporting}>
            <i className="fa-solid fa-file-excel me-1" /> Excel
          </button>
        </div>
      </div>

      <div className="text-secondary d-print-none mb-2" style={{ fontSize: '0.72rem' }}>
        Print/PDF/Excel always include every row matching your current filters above — not just the page shown on screen.
      </div>

      {loadError && (
        <div className="alert alert-danger small d-print-none">
          Couldn't load this report: {loadError}
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="row g-3 mb-3">
          {activeTab === 'sales' && (
            <>
              <SummaryCard label="Total Sales" value={formatCurrency(summary.totalSales)} color="#22C55E" />
              <SummaryCard label="Total Orders" value={summary.totalOrders} color="#4F46E5" />
              <SummaryCard label="Total Discount" value={formatCurrency(summary.totalDiscount)} color="#F59E0B" />
            </>
          )}
          {activeTab === 'expense' && (
            <>
              <SummaryCard label="Total Expense" value={formatCurrency(summary.totalExpense)} color="#EF4444" />
              {(summary.byCategory ?? []).slice(0, 3).map((c) => (
                <SummaryCard key={c.category} label={c.category} value={formatCurrency(c.total)} color="#F59E0B" />
              ))}
            </>
          )}
          {activeTab === 'profit' && (
            <>
              <SummaryCard label="Total Sales" value={formatCurrency(summary.totalSales)} color="#22C55E" />
              <SummaryCard label="Total Expenses" value={formatCurrency(summary.totalExpenses)} color="#EF4444" />
              <SummaryCard label="Net Profit" value={formatCurrency(summary.profit)} color="#4F46E5" />
            </>
          )}
          {activeTab === 'purchase' && (
            <>
              <SummaryCard label="Total Entries" value={summary.totalEntries} color="#4F46E5" />
              <SummaryCard label="Total Qty Purchased" value={summary.totalQty} color="#22C55E" />
              <SummaryCard label="Total Cost" value={formatCurrency(summary.totalCost)} color="#F59E0B" />
            </>
          )}
          {activeTab === 'stock' && (
            <>
              <SummaryCard label="Total Products" value={summary.totalProducts} color="#4F46E5" />
              <SummaryCard label="Total Stock Value" value={formatCurrency(summary.totalStockValue)} color="#22C55E" />
              <SummaryCard label="Low Stock" value={summary.lowStockCount} color="#F59E0B" />
              <SummaryCard label="Negative Stock" value={summary.negativeStockCount} color="#EF4444" />
            </>
          )}
          {activeTab === 'customer' && (
            <>
              <SummaryCard label="New in Range" value={summary.newCustomers} color="#22C55E" />
              <SummaryCard label="Total Customers" value={summary.totalCustomers} color="#4F46E5" />
            </>
          )}
          {activeTab === 'inquiry' && (
            <>
              <SummaryCard label="Total Inquiries" value={summary.total} color="#4F46E5" />
              {Object.entries(summary.byStatus ?? {}).map(([status, count]) => (
                <SummaryCard key={status} label={status} value={count} color="#F59E0B" />
              ))}
            </>
          )}
        </div>
      )}

      {activeTab === 'sales' && paymentBreakdown && (
        <div className="mb-3">
          <PaymentBreakdownCards
            breakdown={paymentBreakdown}
            title={`Payment Breakdown — ${dateRangeLabel}`}
            compact
            activeMethod={salesPaymentFilter}
            onMethodClick={(method) => handleSalesPaymentFilterChange(salesPaymentFilter === method ? '' : method)}
          />
        </div>
      )}

      {/* Data table (Profit has no row-level table — summary only) */}
      {activeTab !== 'profit' && (
        <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr className="text-secondary small">
                  {activeTab === 'sales' && <th className="d-print-none"></th>}
                  {COLUMNS[activeTab].map((c) => <th key={c.key}>{c.header}</th>)}
                  {ROW_ACTIONS[activeTab] && <th className="d-print-none"></th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={COLUMNS[activeTab].length + 2} className="text-center py-4 text-secondary">Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={COLUMNS[activeTab].length + 2} className="text-center py-4 text-secondary">No data for this range.</td></tr>
                ) : (
                  rows.map((row, i) => {
                    const isSales = activeTab === 'sales';
                    const isExpanded = isSales && expandedSaleId === row.id;
                    const items = isSales ? saleItemsMap[row.id] : null;

                    return (
                      <Fragment key={row.id ?? i}>
                        <tr>
                          {isSales && (
                            <td className="d-print-none">
                              <button className="btn btn-sm btn-light" onClick={() => toggleSaleItemsExpand(row.id)} title="Show items">
                                <i className={`fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
                              </button>
                            </td>
                          )}
                          {COLUMNS[activeTab].map((c) => <td key={c.key}>{row[c.key] ?? '—'}</td>)}
                          {ROW_ACTIONS[activeTab] && (
                            <td className="text-end d-print-none">{ROW_ACTIONS[activeTab](row, navigate)}</td>
                          )}
                        </tr>
                        {isExpanded && (
                          <tr className="d-print-none">
                            <td colSpan={COLUMNS[activeTab].length + 2} className="bg-light">
                              <div className="p-2 ps-4">
                                <div className="fw-semibold small mb-1">Items in {row.invoice_no}:</div>
                                {!items || items.length === 0 ? (
                                  <div className="text-secondary small">No items found.</div>
                                ) : (
                                  <ul className="mb-0 small">
                                    {items.map((item, idx) => (
                                      <li key={idx}>{item.name} <span className="text-secondary">× {item.qty}</span></li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="card-body pt-0 d-print-none">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div className="d-flex align-items-center gap-2">
                <span className="text-secondary small">Rows per page:</span>
                <select
                  className="form-select form-select-sm"
                  style={{ width: 'auto' }}
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                >
                  {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <Pagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="col-6 col-md-3">
      <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '14px' }}>
        <div className="card-body">
          <div className="text-secondary small text-truncate">{label}</div>
          <div className="fs-5 fw-bold" style={{ color }}>{value}</div>
        </div>
      </div>
    </div>
  );
}
