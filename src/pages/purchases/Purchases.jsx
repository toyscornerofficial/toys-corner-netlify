import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import DateRangeFilter, { computeRangeForPreset } from '../../components/ui/DateRangeFilter';
import BrowseProductsModal from '../../components/sales/BrowseProductsModal';
import { getProducts } from '../../services/productService';
import { getPurchaseEntries, createPurchaseEntry, updatePurchaseEntry, deletePurchaseEntry } from '../../services/purchaseService';
import { formatCurrency, formatDateIST } from '../../utils/dateHelpers';

const DEFAULT_PAGE_SIZE = 10;

export default function Purchases() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight'); // set when arriving via a Reports "Go" link

  const [products, setProducts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [range, setRange] = useState({ preset: 'this_month', ...computeRangeForPreset('this_month') });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Product search + Browse All for the New Purchase Entry form
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [browseModalOpen, setBrowseModalOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { product_id: '', qty: '', purchase_price: '', supplier: '', bill_number: '', date: new Date().toISOString().slice(0, 10) },
  });

  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    formState: { isSubmitting: isEditSubmitting },
  } = useForm();

  const loadProducts = async () => {
    try {
      const productList = await getProducts();
      setProducts(productList);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load products.');
    }
  };

  const loadEntries = async () => {
    setLoading(true);
    try {
      const entryResult = await getPurchaseEntries({ start: range.start, end: range.end, search, page, pageSize });
      setEntries(entryResult.data);
      setTotalCount(entryResult.count);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load purchase entries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, page, search, pageSize]);

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setPage(1);
  };

  const loadData = async () => {
    await Promise.all([loadProducts(), loadEntries()]);
  };

  const handleRangeChange = (newRange) => {
    setRange(newRange);
    setPage(1);
  };

  const clearRange = () => {
    setRange({ preset: 'all', start: null, end: null });
    setPage(1);
  };

  // ---------- Product search / select for New Purchase Entry ----------
  const handleProductSearch = (value) => {
    setProductQuery(value);
    if (value.trim().length < 1) {
      setProductResults([]);
      return;
    }
    const matches = products.filter((p) => p.product_name.toLowerCase().includes(value.toLowerCase()));
    setProductResults(matches.slice(0, 15));
  };

  const selectProduct = (product) => {
    setSelectedProduct(product);
    setValue('product_id', product.id, { shouldValidate: true });
    setProductQuery('');
    setProductResults([]);
  };

  const clearSelectedProduct = () => {
    setSelectedProduct(null);
    setValue('product_id', '', { shouldValidate: true });
  };

  const onSubmit = async (values) => {
    try {
      await createPurchaseEntry({
        product_id: values.product_id,
        qty: Number(values.qty),
        purchase_price: Number(values.purchase_price),
        supplier: values.supplier || null,
        bill_number: values.bill_number || null,
        date: values.date,
      });
      toast.success('Purchase entry saved — stock updated automatically.');
      reset({ product_id: '', qty: '', purchase_price: '', supplier: '', bill_number: '', date: values.date });
      clearSelectedProduct();
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to save purchase entry.');
    }
  };

  const openEditModal = (entry) => {
    setEditingEntry(entry);
    resetEdit({
      product_id: entry.product_id,
      qty: entry.qty,
      purchase_price: entry.purchase_price,
      supplier: entry.supplier ?? '',
      bill_number: entry.bill_number ?? '',
      date: entry.date,
    });
    setEditModalOpen(true);
  };

  const onEditSubmit = async (values) => {
    try {
      await updatePurchaseEntry(editingEntry.id, {
        product_id: values.product_id,
        qty: Number(values.qty),
        purchase_price: Number(values.purchase_price),
        supplier: values.supplier || null,
        bill_number: values.bill_number || null,
        date: values.date,
      });
      toast.success('Purchase entry updated — stock adjusted by the difference.');
      setEditModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to update purchase entry.');
    }
  };

  const handleDelete = async () => {
    try {
      await deletePurchaseEntry(deleteTarget.id);
      toast.success('Purchase entry deleted — stock reversed automatically.');
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to delete purchase entry.');
    }
  };

  return (
    <div>
      <h4 className="fw-bold mb-4">Purchase Entry</h4>

      <div className="row g-3">
        <div className="col-lg-5">
          <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
            <div className="card-body">
              <h6 className="fw-bold mb-3">New Purchase Entry</h6>
              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Product</label>
                  {selectedProduct ? (
                    <div className="d-flex justify-content-between align-items-center bg-light rounded p-2">
                      <div>
                        <div className="fw-semibold">{selectedProduct.product_name}</div>
                        <div className="text-secondary small">current stock: {selectedProduct.current_stock}</div>
                      </div>
                      <button type="button" className="btn btn-sm btn-light" onClick={clearSelectedProduct}>
                        <i className="fa-solid fa-xmark" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="d-flex gap-2">
                        <div className="position-relative flex-grow-1">
                          <input
                            className={`form-control ${errors.product_id ? 'is-invalid' : ''}`}
                            placeholder="Search product by name..."
                            value={productQuery}
                            onChange={(e) => handleProductSearch(e.target.value)}
                          />
                          {productResults.length > 0 && (
                            <div
                              className="position-absolute w-100 bg-white border rounded shadow-sm mt-1"
                              style={{ zIndex: 10, maxHeight: 240, overflowY: 'auto' }}
                            >
                              {productResults.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className="btn btn-light w-100 text-start d-flex justify-content-between align-items-center border-0 rounded-0"
                                  onClick={() => selectProduct(p)}
                                >
                                  <span>{p.product_name}</span>
                                  <span className="text-secondary small">stock: {p.current_stock}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button type="button" className="btn btn-outline-primary flex-shrink-0" onClick={() => setBrowseModalOpen(true)}>
                          <i className="fa-solid fa-list me-1" />
                          Browse All
                        </button>
                      </div>
                      {/* Hidden field carries the actual value react-hook-form validates/submits */}
                      <input type="hidden" {...register('product_id', { required: 'Select a product' })} />
                      {errors.product_id && <div className="text-danger small mt-1">{errors.product_id.message}</div>}
                    </>
                  )}
                </div>

                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold">Qty</label>
                    <input
                      type="number" min="1"
                      className={`form-control ${errors.qty ? 'is-invalid' : ''}`}
                      {...register('qty', { required: true, min: 1 })}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold">Purchase Price (₹)</label>
                    <input
                      type="number" step="0.01" min="0"
                      className={`form-control ${errors.purchase_price ? 'is-invalid' : ''}`}
                      {...register('purchase_price', { required: true, min: 0 })}
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-semibold">Supplier</label>
                  <input className="form-control" {...register('supplier')} />
                </div>

                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold">Bill Number</label>
                    <input className="form-control" {...register('bill_number')} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold">Date</label>
                    <input type="date" className="form-control" {...register('date', { required: true })} />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn w-100 text-white fw-semibold"
                  style={{ background: '#4F46E5' }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save & Update Stock'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <h6 className="fw-bold mb-0">Recent Purchase Entries</h6>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <input
                    className="form-control form-control-sm"
                    style={{ width: 200 }}
                    placeholder="Search product, supplier, bill no..."
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                  />
                  <DateRangeFilter
                    value={range.preset === 'all' ? { preset: 'this_month', ...computeRangeForPreset('this_month') } : range}
                    onChange={handleRangeChange}
                  />
                  {range.preset !== 'all' && (
                    <button className="btn btn-sm btn-light" onClick={clearRange}>
                      <i className="fa-solid fa-xmark me-1" /> Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr className="text-secondary small">
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Supplier</th>
                      <th>Date</th>
                      <th>Remaining</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="text-center py-3 text-secondary">Loading...</td></tr>
                    ) : entries.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-3 text-secondary">No purchase entries in this range.</td></tr>
                    ) : (
                      entries.map((e) => {
                        const isConsumed = e.remaining_qty < e.qty;
                        return (
                          <tr key={e.id} className={highlightId === e.id ? 'table-warning' : ''}>
                            <td>{e.products?.product_name ?? '—'}</td>
                            <td>{e.qty}</td>
                            <td>{formatCurrency(e.purchase_price)}</td>
                            <td>{e.supplier || '—'}</td>
                            <td>{formatDateIST(e.date, 'DD MMM')}</td>
                            <td>
                              <span className={`badge ${e.remaining_qty === 0 ? 'bg-secondary' : 'bg-success'}`}>
                                {e.remaining_qty}
                              </span>
                            </td>
                            <td className="text-end">
                              <button className="btn btn-sm btn-light me-1" onClick={() => openEditModal(e)}>
                                <i className="fa-solid fa-pen" />
                              </button>
                              <button
                                className="btn btn-sm btn-light text-danger"
                                onClick={() => setDeleteTarget(e)}
                                disabled={isConsumed}
                                title={isConsumed ? 'Cannot delete — some units from this batch have already been sold' : 'Delete'}
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
        </div>
      </div>

      <Modal show={editModalOpen} title="Edit Purchase Entry" onClose={() => setEditModalOpen(false)}>
        <form onSubmit={handleEditSubmit(onEditSubmit)} noValidate>
          <div className="mb-3">
            <label className="form-label small fw-semibold">Product</label>
            <select className="form-select" {...registerEdit('product_id', { required: true })}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.product_name} (current: {p.current_stock})</option>
              ))}
            </select>
          </div>
          <div className="row g-2 mb-3">
            <div className="col-6">
              <label className="form-label small fw-semibold">Qty</label>
              <input type="number" min="1" className="form-control" {...registerEdit('qty', { required: true, min: 1 })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Purchase Price (₹)</label>
              <input type="number" step="0.01" min="0" className="form-control" {...registerEdit('purchase_price', { required: true, min: 0 })} />
            </div>
          </div>
          <div className="mb-3">
            <label className="form-label small fw-semibold">Supplier</label>
            <input className="form-control" {...registerEdit('supplier')} />
          </div>
          <div className="row g-2 mb-3">
            <div className="col-6">
              <label className="form-label small fw-semibold">Bill Number</label>
              <input className="form-control" {...registerEdit('bill_number')} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Date</label>
              <input type="date" className="form-control" {...registerEdit('date', { required: true })} />
            </div>
          </div>
          <div className="alert alert-info small py-2">
            Stock is adjusted automatically by the difference between the old and new quantity — no manual correction needed.
          </div>
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-light" onClick={() => setEditModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn text-white fw-semibold" style={{ background: '#4F46E5' }} disabled={isEditSubmitting}>
              {isEditSubmitting ? 'Saving...' : 'Update'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal show={Boolean(deleteTarget)} title="Delete Purchase Entry" onClose={() => setDeleteTarget(null)}>
        <p>
          Delete this purchase entry for <strong>{deleteTarget?.products?.product_name}</strong>?
          Stock will be reduced by {deleteTarget?.qty} to reverse it, and this is logged in the activity log.
        </p>
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-light" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </Modal>
      <Modal show={browseModalOpen} title="Browse All Products" onClose={() => setBrowseModalOpen(false)} size="modal-lg">
        {browseModalOpen && (
          <BrowseProductsModal
            onAdd={(product) => {
              selectProduct(product);
              setBrowseModalOpen(false);
            }}
            onClose={() => setBrowseModalOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
}
