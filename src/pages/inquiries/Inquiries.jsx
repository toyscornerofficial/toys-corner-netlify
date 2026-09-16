import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import DateRangeFilter, { computeRangeForPreset } from '../../components/ui/DateRangeFilter';
import InquiryForm from '../../components/forms/InquiryForm';
import { getInquiries, updateInquiryStatus, deleteInquiry, STATUSES } from '../../services/inquiryService';
import { formatDateIST } from '../../utils/dateHelpers';
import { openWhatsApp } from '../../utils/whatsapp';

const PAGE_SIZE = 10;

const STATUS_COLORS = {
  Pending: '#F59E0B',
  Ordered: '#4F46E5',
  Available: '#22C55E',
  Called: '#4F46E5',
  Completed: '#22C55E',
  Cancelled: '#EF4444',
};

export default function Inquiries() {
  const [searchParams] = useSearchParams();

  const [inquiries, setInquiries] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState({ preset: 'all', start: null, end: null }); // 'all' = no date restriction, matches prior default behavior
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingInquiry, setEditingInquiry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadInquiries = async () => {
    setLoading(true);
    try {
      const { data, count } = await getInquiries({
        status: statusFilter,
        search,
        start: range.start,
        end: range.end,
        page,
        pageSize: PAGE_SIZE,
      });
      setInquiries(data);
      setTotalCount(count);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load inquiries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search, range, page]);

  const handleStatusFilterChange = (value) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
  };

  const handleRangeChange = (newRange) => {
    setRange(newRange);
    setPage(1);
  };

  const clearRange = () => {
    setRange({ preset: 'all', start: null, end: null });
    setPage(1);
  };

  const openAddModal = () => {
    setEditingInquiry(null);
    setModalOpen(true);
  };

  const openEditModal = (inquiry) => {
    setEditingInquiry(inquiry);
    setModalOpen(true);
  };

  const handleSaved = () => {
    setModalOpen(false);
    loadInquiries();
  };

  const handleQuickStatus = async (inquiry, status) => {
    try {
      await updateInquiryStatus(inquiry.id, status);
      toast.success(`Marked as ${status}.`);
      loadInquiries();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update status.');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteInquiry(deleteTarget.id);
      toast.success('Inquiry deleted.');
      setDeleteTarget(null);
      loadInquiries();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete inquiry.');
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h4 className="fw-bold mb-0">Inquiry</h4>
        <button className="btn text-white fw-semibold" style={{ background: '#4F46E5' }} onClick={openAddModal}>
          <i className="fa-solid fa-plus me-2" />
          Add Inquiry
        </button>
      </div>

      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <input
          className="form-control"
          style={{ maxWidth: 240 }}
          placeholder="Search name, phone, product..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        <select
          className="form-select"
          style={{ maxWidth: 160, width: 'auto' }}
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value)}
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <DateRangeFilter value={range.preset === 'all' ? { preset: 'this_month', ...computeRangeForPreset('this_month') } : range} onChange={handleRangeChange} />
        {range.preset !== 'all' && (
          <button className="btn btn-sm btn-light" onClick={clearRange}>
            <i className="fa-solid fa-xmark me-1" /> Clear Date Filter
          </button>
        )}
      </div>

      <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr className="text-secondary small">
                <th>Customer</th>
                <th>Product</th>
                <th>Status</th>
                <th>Date</th>
                <th>Follow-up</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-4 text-secondary">Loading...</td></tr>
              ) : inquiries.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-4 text-secondary">No inquiries found.</td></tr>
              ) : (
                inquiries.map((inq) => (
                  <tr key={inq.id}>
                    <td>
                      <div className="fw-semibold">{inq.name}</div>
                      <div className="text-secondary small">{inq.phone}</div>
                    </td>
                    <td>{inq.required_product}</td>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        style={{ width: 120, background: `${STATUS_COLORS[inq.status]}1A`, color: STATUS_COLORS[inq.status], fontWeight: 600 }}
                        value={inq.status}
                        onChange={(e) => handleQuickStatus(inq, e.target.value)}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>{formatDateIST(inq.date, 'DD MMM')}</td>
                    <td>{inq.followup_date ? formatDateIST(inq.followup_date, 'DD MMM') : '—'}</td>
                    <td className="text-end">
                      <a href={`tel:${inq.phone}`} className="btn btn-sm btn-light me-1" title="Call">
                        <i className="fa-solid fa-phone" />
                      </a>
                      <button
                        className="btn btn-sm btn-light me-1"
                        style={{ color: '#22C55E' }}
                        title="WhatsApp"
                        onClick={() =>
                          openWhatsApp(
                            inq.phone,
                            inq.name,
                            `Hello {name},\n\nGood news — checking in about your inquiry for "${inq.required_product}" at Toys Corner.`
                          )
                        }
                      >
                        <i className="fa-brands fa-whatsapp" />
                      </button>
                      <button className="btn btn-sm btn-light me-1" onClick={() => openEditModal(inq)}>
                        <i className="fa-solid fa-pen" />
                      </button>
                      <button className="btn btn-sm btn-light text-danger" onClick={() => setDeleteTarget(inq)}>
                        <i className="fa-solid fa-trash" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="card-body pt-0">
          <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} />
        </div>
      </div>

      <Modal show={modalOpen} title={editingInquiry ? 'Edit Inquiry' : 'Add Inquiry'} onClose={() => setModalOpen(false)} size="modal-lg">
        <InquiryForm inquiry={editingInquiry} onSaved={handleSaved} onCancel={() => setModalOpen(false)} />
      </Modal>

      <Modal show={Boolean(deleteTarget)} title="Delete Inquiry" onClose={() => setDeleteTarget(null)}>
        <p>Delete this inquiry for <strong>{deleteTarget?.name}</strong>?</p>
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-light" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
