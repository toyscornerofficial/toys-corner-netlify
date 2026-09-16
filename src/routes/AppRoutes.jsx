import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AppLayout from '../layouts/AppLayout';

import Login from '../pages/auth/Login';
import ForgotPassword from '../pages/auth/ForgotPassword';
import ResetPassword from '../pages/auth/ResetPassword';

import Dashboard from '../pages/dashboard/Dashboard';
import Sales from '../pages/sales/Sales';
import Invoice from '../pages/sales/Invoice';
import Purchases from '../pages/purchases/Purchases';
import Stock from '../pages/stock/Stock';
import Customers from '../pages/customers/Customers';
import Inquiries from '../pages/inquiries/Inquiries';
import Expenses from '../pages/expenses/Expenses';
import Reports from '../pages/reports/Reports';
import Settings from '../pages/settings/Settings';
import UserSettings from '../pages/users/UserSettings';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected, but outside the sidebar layout — full-page print view */}
      <Route element={<ProtectedRoute />}>
        <Route path="/sales/invoice/:id" element={<Invoice />} />
      </Route>

      {/* Protected, inside the sidebar layout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/inquiries" element={<Inquiries />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/users" element={<UserSettings />} />
        </Route>
      </Route>

      {/* Fallbacks */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
