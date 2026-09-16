import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import Modal from '../../components/ui/Modal';
import UserForm from '../../components/forms/UserForm';
import { useAuth } from '../../context/AuthContext';
import { getUsers, toggleUserActive, deleteUser } from '../../services/userService';
import { formatDateIST } from '../../utils/dateHelpers';

export default function UserSettings() {
  const { isAdmin, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openAddModal = () => {
    setEditingUser(null);
    setModalOpen(true);
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setModalOpen(true);
  };

  const handleSaved = () => {
    setModalOpen(false);
    loadUsers();
  };

  const handleToggleActive = async (u) => {
    try {
      await toggleUserActive(u.id, !u.is_active);
      toast.success(u.is_active ? `${u.name} disabled.` : `${u.name} re-enabled.`);
      loadUsers();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to update status.');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteUser(deleteTarget.id);
      toast.success('User deleted.');
      setDeleteTarget(null);
      loadUsers();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to delete user.');
    }
  };

  if (!isAdmin) {
    return (
      <div>
        <h4 className="fw-bold mb-3">User Settings</h4>
        <div className="alert alert-warning">Only an Admin can manage users.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h4 className="fw-bold mb-0">User Settings</h4>
        <button className="btn text-white fw-semibold" style={{ background: '#4F46E5' }} onClick={openAddModal}>
          <i className="fa-solid fa-user-plus me-2" />
          Add User
        </button>
      </div>

      <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr className="text-secondary small">
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-4 text-secondary">Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-4 text-secondary">No users found.</td></tr>
              ) : (
                users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id}>
                      <td className="fw-semibold">
                        {u.name} {isSelf && <span className="badge bg-light text-dark border ms-1">You</span>}
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`badge ${u.role === 'Admin' ? 'bg-primary' : 'bg-secondary'}`}>{u.role}</span>
                      </td>
                      <td>
                        <div className="form-check form-switch mb-0" style={{ minHeight: 0 }}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            style={{ width: '2.5em', height: '1.3em', cursor: isSelf ? 'not-allowed' : 'pointer' }}
                            checked={u.is_active}
                            onChange={() => handleToggleActive(u)}
                            disabled={isSelf}
                            title={isSelf ? "Can't disable your own account" : u.is_active ? 'Click to disable' : 'Click to enable'}
                          />
                          <label
                            className={`form-check-label small fw-semibold ms-1 ${u.is_active ? 'text-success' : 'text-danger'}`}
                            style={{ cursor: isSelf ? 'not-allowed' : 'pointer' }}
                            onClick={() => !isSelf && handleToggleActive(u)}
                          >
                            {u.is_active ? 'Active' : 'Disabled'}
                          </label>
                        </div>
                      </td>
                      <td className="text-secondary small">{formatDateIST(u.created_at, 'DD MMM YYYY')}</td>
                      <td className="text-end">
                        <button className="btn btn-sm btn-light me-1" onClick={() => openEditModal(u)} title="Edit">
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button
                          className="btn btn-sm btn-light text-danger"
                          onClick={() => setDeleteTarget(u)}
                          disabled={isSelf}
                          title={isSelf ? "Can't delete your own account" : 'Delete'}
                        >
                          <i className="fa-solid fa-trash" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal show={modalOpen} title={editingUser ? 'Edit User' : 'Add User'} onClose={() => setModalOpen(false)}>
        <UserForm user={editingUser} onSaved={handleSaved} onCancel={() => setModalOpen(false)} />
      </Modal>

      <Modal show={Boolean(deleteTarget)} title="Delete User" onClose={() => setDeleteTarget(null)}>
        <p>
          Permanently delete <strong>{deleteTarget?.name}</strong>'s account? They'll no longer be able to log in.
          This can't be undone.
        </p>
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-light" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
