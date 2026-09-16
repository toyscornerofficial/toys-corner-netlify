import { useEffect, useState, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import DateRangeFilter, { computeRangeForPreset } from '../../components/ui/DateRangeFilter';
import CustomerForm from '../../components/forms/CustomerForm';
import BulkWhatsAppModal from '../../components/customers/BulkWhatsAppModal';
import { getCustomers, deleteCustomer, getCustomerPurchaseHistory } from '../../services/customerService';
import { formatCurrency, formatDateIST, getISTDateString } from '../../utils/dateHelpers';
import { openWhatsApp } from '../../utils/whatsapp';

const PAGE_SIZE = 10;

/** True if the given birthday's month matches the current IST month (any year). */
function isBirthdayThisMonth(birthday) {
  if (!birthday) return false;
  const birthMonth = birthday.slice(5, 7); // 'YYYY-MM-DD' -> 'MM'
  const currentMonth = getISTDateString().slice(5, 7);
  return birthMonth === currentMonth;
}

export default function Customers() {
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [range, setRange] = useState({ preset: 'all', start: null, end: null });
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  // Expanded row: purchase history + total spend, loaded lazily on expand
  const [expandedId, setExpandedId] = useState(null);
  const [historyCache, setHistoryCache] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { data, count } = await getCustomers({ search, start: range.start, end: range.end, page, pageSize: PAGE_SIZE });
      setCustomers(data);
      setTotalCount(count);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, range, page]);

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
    setEditingCustomer(null);
    setModalOpen(true);
  };

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    setModalOpen(true);
  };

  const handleSaved = () => {
    setModalOpen(false);
    loadCustomers();
  };

  const handleDelete = async () => {
    try {
      await deleteCustomer(deleteTarget.id);
      toast.success('Customer deleted.');
      setDeleteTarget(null);
      loadCustomers();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to delete — customer may have existing sales records.');
    }
  };

  const toggleExpand = async (customerId) => {
    if (expandedId === customerId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(customerId);
    if (!historyCache[customerId]) {
      setHistoryLoading(true);
      try {
        const history = await getCustomerPurchaseHistory(customerId);
        setHistoryCache((prev) => ({ ...prev, [customerId]: history }));
      } catch (err) {
        console.error(err);
        toast.error('Failed to load purchase history.');
      } finally {
        setHistoryLoading(false);
      }
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h4 className="fw-bold mb-0">Customers</h4>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-success fw-semibold" onClick={() => setBulkModalOpen(true)}>
            <i className="fa-brands fa-whatsapp me-2" />
            Send Offer to All
          </button>
          <button className="btn text-white fw-semibold" style={{ background: '#4F46E5' }} onClick={openAddModal}>
            <i className="fa-solid fa-plus me-2" />
            Add Customer
          </button>
        </div>
      </div>

      <div className="mb-3 d-flex align-items-center gap-2 flex-wrap">
        <input
          className="form-control"
          style={{ maxWidth: 260 }}
          placeholder="Search by name, phone, or customer ID..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        <DateRangeFilter
          value={range.preset === 'all' ? { preset: 'this_month', ...computeRangeForPreset('this_month') } : range}
          onChange={handleRangeChange}
        />
        <span className="text-secondary" style={{ fontSize: '0.72rem' }}>(filters by date joined)</span>
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
                <th></th>
                <th>Customer ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Birthday</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-4 text-secondary">Loading...</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-4 text-secondary">No customers found.</td></tr>
              ) : (
                customers.map((c) => (
                  <Fragment key={c.id}>
                    <tr>
                      <td>
                        <button className="btn btn-sm btn-light" onClick={() => toggleExpand(c.id)}>
                          <i className={`fa-solid ${expandedId === c.id ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
                        </button>
                      </td>
                      <td><span className="badge bg-light text-dark border">{c.unique_customer_id}</span></td>
                      <td className="fw-semibold">{c.name}</td>
                      <td>{c.phone}</td>
                      <td>
                        {c.birthday ? (
                          isBirthdayThisMonth(c.birthday) ? (
                            <span className="birthday-highlight">
                              <i className="fa-solid fa-cake-candles me-1" />
                              {formatDateIST(c.birthday, 'DD MMM')}
                            </span>
                          ) : (
                            formatDateIST(c.birthday, 'DD MMM')
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-end">
                        <a href={`tel:${c.phone}`} className="btn btn-sm btn-light me-1" title="Call">
                          <i className="fa-solid fa-phone" />
                        </a>
                        <button
                          className="btn btn-sm btn-light me-1"
                          style={{ color: '#22C55E' }}
                          title="WhatsApp"
                          onClick={() => openWhatsApp(c.phone, c.name)}
                        >
                          <i className="fa-brands fa-whatsapp" />
                        </button>
                        <button className="btn btn-sm btn-light me-1" onClick={() => openEditModal(c)}>
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button className="btn btn-sm btn-light text-danger" onClick={() => setDeleteTarget(c)}>
                          <i className="fa-solid fa-trash" />
                        </button>
                      </td>
                    </tr>
                    {expandedId === c.id && (
                      <tr>
                        <td colSpan={6} className="bg-light">
                          <div className="p-3">
                            <h6 className="fw-bold small mb-2">Purchase History</h6>
                            {historyLoading && !historyCache[c.id] ? (
                              <div className="text-secondary small">Loading...</div>
                            ) : (historyCache[c.id] ?? []).length === 0 ? (
                              <div className="text-secondary small">No purchases yet.</div>
                            ) : (
                              <>
                                <div className="fw-semibold small mb-2">
                                  Total Purchase:{' '}
                                  {formatCurrency(
                                    (historyCache[c.id] ?? []).reduce((sum, s) => sum + Number(s.grand_total), 0)
                                  )}
                                </div>
                                <table className="table table-sm mb-0 bg-white">
                                  <thead>
                                    <tr className="text-secondary small">
                                      <th>Invoice</th>
                                      <th>Date</th>
                                      <th>Payment</th>
                                      <th className="text-end">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(historyCache[c.id] ?? []).map((s) => (
                                      <tr key={s.id}>
                                        <td>{s.invoice_no}</td>
                                        <td>{formatDateIST(s.date, 'DD MMM YYYY')}</td>
                                        <td>{s.payment_method}</td>
                                        <td className="text-end">{formatCurrency(s.grand_total)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="card-body pt-0">
          <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} />
        </div>
      </div>

      <Modal show={modalOpen} title={editingCustomer ? 'Edit Customer' : 'Add Customer'} onClose={() => setModalOpen(false)} size="modal-lg">
        <CustomerForm customer={editingCustomer} onSaved={handleSaved} onCancel={() => setModalOpen(false)} />
      </Modal>

      <Modal show={Boolean(deleteTarget)} title="Delete Customer" onClose={() => setDeleteTarget(null)}>
        <p>Delete <strong>{deleteTarget?.name}</strong>? This is logged in the activity log.</p>
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-light" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </Modal>

      <Modal show={bulkModalOpen} title="Send Offer to All Customers" onClose={() => setBulkModalOpen(false)} size="modal-lg">
        {bulkModalOpen && <BulkWhatsAppModal onClose={() => setBulkModalOpen(false)} />}
      </Modal>
    </div>
  );
}
