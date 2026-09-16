import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import { useAuth } from '../../context/AuthContext';
import StatCard from '../../components/ui/StatCard';
import AlertListCard from '../../components/ui/AlertListCard';
import SalesLineChart from '../../components/charts/SalesLineChart';
import SimpleBarChart from '../../components/charts/SimpleBarChart';
import TopSellersLeaderboard from '../../components/charts/TopSellersLeaderboard';

import {
  getTodayStats,
  getMonthStats,
  getLowStockProducts,
  getNegativeStockProducts,
  getPendingInquiryCount,
  getDailySalesSeries,
  getMonthlySalesSeries,
  getExpenseSeries,
  getTopSellingProducts,
} from '../../services/dashboardService';
import { formatCurrency } from '../../utils/dateHelpers';

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [negativeStock, setNegativeStock] = useState([]);
  const [pendingInquiries, setPendingInquiries] = useState(0);

  // Admin-only Monthly + Charts section loads separately, behind its own
  // small spinner, instead of blocking Today's cards (which are fast) from
  // showing until every chart query has also finished.
  const [adminLoading, setAdminLoading] = useState(true);
  const [month, setMonth] = useState(null);
  const [dailySales, setDailySales] = useState({ labels: [], values: [] });
  const [monthlySales, setMonthlySales] = useState({ labels: [], values: [] });
  const [expenseSeries, setExpenseSeries] = useState({ labels: [], values: [] });
  const [topProducts, setTopProducts] = useState([]);

  // Fast path: Today's KPIs + alerts, shown to both Admin and Staff.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [todayStats, low, negative, pending] = await Promise.all([
          getTodayStats(),
          getLowStockProducts(),
          getNegativeStockProducts(),
          getPendingInquiryCount(),
        ]);

        if (cancelled) return;
        setToday(todayStats);
        setLowStock(low);
        setNegativeStock(negative);
        setPendingInquiries(pending);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load dashboard data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Slower path: Monthly KPIs + all 4 charts, Admin only. Runs independently
  // so it never delays Today's cards from appearing.
  useEffect(() => {
    if (isAdmin === undefined) return; // role still loading — wait for it
    if (!isAdmin) {
      setAdminLoading(false);
      return;
    }

    let cancelled = false;
    setAdminLoading(true);

    async function loadAdminSection() {
      try {
        const [monthStats, daily, monthly, expenses, top] = await Promise.all([
          getMonthStats(),
          getDailySalesSeries(7),
          getMonthlySalesSeries(6),
          getExpenseSeries(6),
          getTopSellingProducts(5),
        ]);

        if (cancelled) return;
        setMonth(monthStats);
        setDailySales(daily);
        setMonthlySales(monthly);
        setExpenseSeries(expenses);
        setTopProducts(top);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load monthly stats and charts.');
      } finally {
        if (!cancelled) setAdminLoading(false);
      }
    }

    loadAdminSection();
    return () => { cancelled = true; };
  }, [isAdmin]);

  if (loading || !today) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h4 className="fw-bold mb-4">Dashboard</h4>

      {/* Today's KPI cards */}
      <h6 className="text-secondary fw-semibold mb-2">Today</h6>
      <div className="row g-3 mb-4">
        {isAdmin && (
          <>
            <div className="col-6 col-md-4 col-xl-2">
              <StatCard icon="fa-indian-rupee-sign" label="Today's Sales" value={formatCurrency(today.sales)} color="#22C55E" />
            </div>
            <div className="col-6 col-md-4 col-xl-2">
              <StatCard icon="fa-wallet" label="Today's Expenses" value={formatCurrency(today.expenses)} color="#EF4444" />
            </div>
            <div className="col-6 col-md-4 col-xl-2">
              <StatCard icon="fa-chart-line" label="Today's Profit" value={formatCurrency(today.profit)} color="#4F46E5" />
            </div>
          </>
        )}
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard icon="fa-receipt" label="Today's Orders" value={today.orders} color="#F59E0B" />
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard icon="fa-users" label="Today's Customers" value={today.customers} color="#4F46E5" />
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard icon="fa-box" label="Today's Sold Qty" value={today.soldQty} color="#22C55E" />
        </div>
      </div>

      {/* Monthly KPI cards — Admin only (all financial figures) */}
      {isAdmin && (
        <>
          <h6 className="text-secondary fw-semibold mb-2">This Month</h6>
          {adminLoading || !month ? (
            <div className="d-flex justify-content-center py-4 mb-4">
              <div className="spinner-border spinner-border-sm text-primary" role="status" />
            </div>
          ) : (
            <div className="row g-3 mb-4">
              <div className="col-6 col-md-3">
                <StatCard icon="fa-indian-rupee-sign" label="Monthly Sales" value={formatCurrency(month.sales)} color="#22C55E" />
              </div>
              <div className="col-6 col-md-3">
                <StatCard icon="fa-wallet" label="Monthly Expense" value={formatCurrency(month.expenses)} color="#EF4444" />
              </div>
              <div className="col-6 col-md-3">
                <StatCard icon="fa-chart-line" label="Monthly Profit" value={formatCurrency(month.profit)} color="#4F46E5" />
              </div>
              <div className="col-6 col-md-3">
                <StatCard icon="fa-warehouse" label="Total Stock Value" value={formatCurrency(month.stockValue)} color="#F59E0B" />
              </div>
            </div>
          )}
        </>
      )}

      {/* Alerts — visible to both roles, these are operational not financial */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <AlertListCard
            title="Low Stock Items"
            icon="fa-triangle-exclamation"
            color="#F59E0B"
            items={lowStock}
            emptyText="All products are sufficiently stocked."
            onViewAll={() => navigate('/stock?filter=low')}
            renderItem={(p) => (
              <>
                <span className="text-truncate">{p.product_name}</span>
                <span className="fw-semibold" style={{ color: '#F59E0B' }}>{p.current_stock} left</span>
              </>
            )}
          />
        </div>
        <div className="col-md-4">
          <AlertListCard
            title="Negative Stock (Backorders)"
            icon="fa-circle-exclamation"
            color="#EF4444"
            items={negativeStock}
            emptyText="No backorders — nothing sold below zero stock."
            onViewAll={() => navigate('/stock?filter=negative')}
            renderItem={(p) => (
              <>
                <span className="text-truncate">{p.product_name}</span>
                <span className="fw-semibold" style={{ color: '#EF4444' }}>{p.current_stock}</span>
              </>
            )}
          />
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '14px' }}>
            <div className="card-body d-flex flex-column">
              <div className="d-flex align-items-center gap-2 mb-2">
                <i className="fa-solid fa-circle-question" style={{ color: '#4F46E5' }} />
                <h6 className="fw-bold mb-0">Pending Inquiry</h6>
                {pendingInquiries > 0 && (
                  <button
                    className="btn btn-sm btn-link ms-auto p-0 text-decoration-none"
                    onClick={() => navigate('/inquiries?status=Pending')}
                  >
                    View All <i className="fa-solid fa-arrow-right ms-1" style={{ fontSize: '0.7rem' }} />
                  </button>
                )}
              </div>
              <div className="fs-2 fw-bold" style={{ color: '#4F46E5' }}>{pendingInquiries}</div>
              <div className="text-secondary small mt-auto">customers waiting on a follow-up</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts — Admin only, since every chart here is financial */}
      {isAdmin && (
        adminLoading ? (
          <div className="d-flex justify-content-center py-5">
            <div className="spinner-border spinner-border-sm text-primary" role="status" />
          </div>
        ) : (
          <>
            <div className="row g-3 mb-4">
              <div className="col-lg-6">
                <SalesLineChart title="Daily Sales (Last 7 Days)" labels={dailySales.labels} values={dailySales.values} color="#22C55E" />
              </div>
              <div className="col-lg-6">
                <SalesLineChart title="Monthly Sales (Last 6 Months)" labels={monthlySales.labels} values={monthlySales.values} color="#4F46E5" />
              </div>
            </div>

            <div className="row g-3">
              <div className="col-lg-6">
                <SimpleBarChart title="Expense Graph (Last 6 Months)" labels={expenseSeries.labels} values={expenseSeries.values} color="#EF4444" />
              </div>
              <div className="col-lg-6">
                <TopSellersLeaderboard items={topProducts} />
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
