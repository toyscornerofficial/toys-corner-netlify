import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getSettings } from '../services/settingsService';

const NAV_ITEMS = [
  { to: '/dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
  { to: '/sales', icon: 'fa-cash-register', label: 'Sales' },
  { to: '/purchases', icon: 'fa-truck', label: 'Purchase Entry' },
  { to: '/stock', icon: 'fa-boxes-stacked', label: 'Stock' },
  { to: '/customers', icon: 'fa-users', label: 'Customers' },
  { to: '/inquiries', icon: 'fa-circle-question', label: 'Inquiry' },
  { to: '/expenses', icon: 'fa-money-bill-wave', label: 'Expenses' },
  { to: '/reports', icon: 'fa-chart-line', label: 'Reports' },
  { to: '/settings', icon: 'fa-gear', label: 'Settings' },
  { to: '/users', icon: 'fa-user-shield', label: 'User Settings', adminOnly: true },
];

export default function Sidebar({ isOpen, onNavigate, isAdmin }) {
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const location = useLocation();
  const [businessName, setBusinessName] = useState('Toys Corner');

  useEffect(() => {
    // Refetches on every navigation (cheap single-row read) so a name
    // change in Settings shows up right away without a full page reload —
    // AppLayout/Sidebar itself doesn't remount between routes, so a
    // mount-only fetch would otherwise go stale until the next hard refresh.
    getSettings()
      .then((s) => setBusinessName(s?.business_name || 'Toys Corner'))
      .catch(() => {}); // sidebar branding is non-critical; fail silently and keep the fallback
  }, [location.pathname]);

  return (
    <aside className={`app-sidebar bg-white border-end d-flex flex-column ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-brand px-3 py-3 border-bottom">
        <span className="fw-bold fs-5" style={{ color: '#4F46E5' }}>
          🧸 {businessName}
        </span>
      </div>
      <nav className="nav flex-column p-2 flex-grow-1" style={{ overflowY: 'auto' }}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `nav-link d-flex align-items-center gap-2 rounded mb-1 px-3 py-2 ${
                isActive ? 'active-nav' : 'text-dark'
              }`
            }
          >
            <i className={`fa-solid ${item.icon}`} style={{ width: '18px' }} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-top px-3 py-2 text-center">
        <a
          href="https://abronixtechnologies.github.io/abronix-landing/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-secondary text-decoration-none"
          style={{ fontSize: '0.72rem' }}
        >
          Powered by <span className="fw-semibold">Abronix Technologies</span>
        </a>
      </div>
    </aside>
  );
}
