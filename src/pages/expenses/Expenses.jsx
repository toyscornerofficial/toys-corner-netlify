import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';

import Modal from '../../components/ui/Modal';
import DateRangeFilter, { computeRangeForPreset } from '../../components/ui/DateRangeFilter';
import Pagination from '../../components/ui/Pagination';
import { getExpenses, createExpense, updateExpense, deleteExpense, getExpenseTotal } from '../../services/expenseService';
import { formatCurrency, formatDateIST, getISTDateString, getISTMonthRange } from '../../utils/dateHelpers';

const CATEGORIES = ['Electricity', 'Rent', 'Salary', 'Transport', 'Tea', 'Maintenance', 'Other'];
const PAGE_SIZE = 10;

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingExpense, setEditingExpense] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Table filter + pagination (independent of the fixed summary cards below)
  const [range, setRange] = useState({ preset: 'today', ...computeRangeForPreset('today') });
  const [page, setPage] = useState(1);

  // Fixed summary cards — always Today / This Month, regardless of the table filter
  const [todayTotal, setTodayTotal] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);

  // Total for whatever range is currently selected in the dropdown above the table
  const [filteredTotal, setFilteredTotal] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { title: '', category: 'Other', amount: '', date: getISTDateString(), note: '' },
  });

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const { data, count } = await getExpenses({ start: range.start, end: range.end, page, pageSize: PAGE_SIZE });
      setExpenses(data);
      setTotalCount(count);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const today = getISTDateString();
      const { start: monthStart, end: monthEnd } = getISTMonthRange();
      const [todaySum, monthSum] = await Promise.all([
        getExpenseTotal(today, today),
        getExpenseTotal(monthStart, monthEnd),
      ]);
      setTodayTotal(todaySum);
      setMonthTotal(monthSum);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, page]);

  useEffect(() => {
    // Total across the whole selected range — not just the current page —
    // so it stays correct regardless of which page you're viewing.
    getExpenseTotal(range.start, range.end)
      .then(setFilteredTotal)
      .catch((err) => console.error(err));
  }, [range.start, range.end]);

  useEffect(() => {
    loadSummary();
  }, []);

  const handleRangeChange = (newRange) => {
    setRange(newRange);
    setPage(1); // reset to first page whenever the filter changes
  };

  const openAddModal = () => {
    setEditingExpense(null);
    reset({ title: '', category: 'Other', amount: '', date: getISTDateString(), note: '' });
    setModalOpen(true);
  };

  const openEditModal = (expense) => {
    setEditingExpense(expense);
    reset({
      title: expense.title,
      category: expense.category,
      amount: expense.amount,
      date: expense.date,
      note: expense.note ?? '',
    });
    setModalOpen(true);
  };

  const onSubmit = async (values) => {
    const payload = { ...values, amount: Number(values.amount) };
    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, payload);
        toast.success('Expense updated.');
      } else {
        await createExpense(payload);
        toast.success('Expense added.');
      }
      setModalOpen(false);
      loadExpenses();
      loadSummary();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to save expense.');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteExpense(deleteTarget.id);
      toast.success('Expense deleted.');
      setDeleteTarget(null);
      loadExpenses();
      loadSummary();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete expense.');
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h4 className="fw-bold mb-0">Expenses</h4>
        <button className="btn text-white fw-semibold" style={{ background: '#4F46E5' }} onClick={openAddModal}>
          <i className="fa-solid fa-plus me-2" />
          Add Expense
        </button>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
            <div className="card-body">
              <div className="text-secondary small">Today's Expense</div>
              <div className="fs-5 fw-bold" style={{ color: '#EF4444' }}>{formatCurrency(todayTotal)}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
            <div className="card-body">
              <div className="text-secondary small">This Month</div>
              <div className="fs-5 fw-bold" style={{ color: '#EF4444' }}>{formatCurrency(monthTotal)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
        <div className="card-body pb-0">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <h6 className="fw-bold mb-0">Expense List</h6>
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <div className="text-end">
                <div className="text-secondary" style={{ fontSize: '0.7rem' }}>Total for selection</div>
                <div className="fw-bold" style={{ color: '#EF4444' }}>{formatCurrency(filteredTotal)}</div>
              </div>
              <DateRangeFilter value={range} onChange={handleRangeChange} />
            </div>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr className="text-secondary small">
                <th>Title</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-4 text-secondary">Loading...</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-4 text-secondary">No expenses in this range.</td></tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="fw-semibold">{e.title}</td>
                    <td><span className="badge bg-light text-dark border">{e.category}</span></td>
                    <td>{formatCurrency(e.amount)}</td>
                    <td>{formatDateIST(e.date, 'DD MMM YYYY')}</td>
                    <td className="text-secondary small">{e.note || '—'}</td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-light me-1" onClick={() => openEditModal(e)}>
                        <i className="fa-solid fa-pen" />
                      </button>
                      <button className="btn btn-sm btn-light text-danger" onClick={() => setDeleteTarget(e)}>
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

      <Modal show={modalOpen} title={editingExpense ? 'Edit Expense' : 'Add Expense'} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="mb-3">
            <label className="form-label small fw-semibold">Title</label>
            <input
              className={`form-control ${errors.title ? 'is-invalid' : ''}`}
              {...register('title', { required: 'Required' })}
            />
            {errors.title && <div className="invalid-feedback">{errors.title.message}</div>}
          </div>

          <div className="row g-2 mb-3">
            <div className="col-6">
              <label className="form-label small fw-semibold">Category</label>
              <select className="form-select" {...register('category')}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Amount (₹)</label>
              <input
                type="number" step="0.01" min="0"
                className={`form-control ${errors.amount ? 'is-invalid' : ''}`}
                {...register('amount', { required: 'Required', min: 0 })}
              />
              {errors.amount && <div className="invalid-feedback">Required</div>}
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label small fw-semibold">Date</label>
            <input type="date" className="form-control" {...register('date', { required: true })} />
          </div>

          <div className="mb-3">
            <label className="form-label small fw-semibold">Note</label>
            <textarea className="form-control" rows={2} {...register('note')} />
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-light" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn text-white fw-semibold" style={{ background: '#4F46E5' }} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingExpense ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal show={Boolean(deleteTarget)} title="Delete Expense" onClose={() => setDeleteTarget(null)}>
        <p>Delete <strong>{deleteTarget?.title}</strong>? This is logged in the activity log.</p>
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-light" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
