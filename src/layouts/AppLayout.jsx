import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuth } from '../context/AuthContext';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAdmin } = useAuth();

  return (
    <div className="app-shell">
      <Sidebar isOpen={sidebarOpen} onNavigate={() => setSidebarOpen(false)} isAdmin={isAdmin} />

      {/* Mobile overlay - tap outside sidebar to close it */}
      {sidebarOpen && (
        <div className="sidebar-overlay d-lg-none" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="app-main">
        <Topbar onToggleSidebar={() => setSidebarOpen((o) => !o)} />
        <main className="app-content p-3 p-lg-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
