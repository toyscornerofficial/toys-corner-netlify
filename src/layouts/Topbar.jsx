import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Topbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="app-topbar d-flex align-items-center justify-content-between px-3 py-2 border-bottom bg-white">
      <button
        className="btn btn-light d-lg-none"
        onClick={onToggleSidebar}
        aria-label="Toggle menu"
      >
        <i className="fa-solid fa-bars" />
      </button>

      <div className="d-none d-lg-block" />

      <div className="d-flex align-items-center gap-3">
        <span className="text-secondary small d-none d-sm-inline">
          {user?.email}
        </span>
        <button className="btn btn-outline-danger btn-sm" onClick={handleLogout}>
          <i className="fa-solid fa-right-from-bracket me-1" />
          Logout
        </button>
      </div>
    </header>
  );
}
