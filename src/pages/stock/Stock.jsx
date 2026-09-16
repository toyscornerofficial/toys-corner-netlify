import { useEffect, useState, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import DateRangeFilter, { computeRangeForPreset } from '../../components/ui/DateRangeFilter';
import ProductForm from '../../components/forms/ProductForm';
import { getProductsPaginated, deleteProduct, getProductBatches } from '../../services/productService';
import { getLowStockProducts, getNegativeStockProducts } from '../../services/dashboardService';
import { formatCurrency, formatDateIST } from '../../utils/dateHelpers';

const PAGE_SIZE = 10;

export default function Stock() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilter = searchParams.get('filter'); // 'low' | 'negative' | null — set by Dashboard's "View All" links

  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [range, setRange] = useState({ preset: 'this_month', ...computeRangeForPreset('this_month') });
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Expandable batch view — loaded lazily per product when expanded
  const [expandedId, setExpandedId] = useState(null);
  const [batchCache, setBatchCache] = useState({});
  const [batchLoading, setBatchLoading] = useState(false);

  const toggleBatches = async (productId) => {
    if (expandedId === productId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(productId);
    if (!batchCache[productId]) {
      setBatchLoading(true);
      try {
        const batches = await getProductBatches(productId);
        setBatchCache((prev) => ({ ...prev, [productId]: batches }));
      } catch (err) {
        console.error(err);
        toast.error('Failed to load batch history.');
      } finally {
        setBatchLoading(false);
      }
    }
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      // Low/Negative Stock links from the Dashboard use the exact same
      // logic as the alert cards themselves (not a paginated general query)
      // — that list is inherently small, so pagination/date filtering
      // don't apply when arriving via one of those links.
      if (urlFilter === 'low') {
        const data = await getLowStockProducts();
        setProducts(data);
        setTotalCount(data.length);
      } else if (urlFilter === 'negative') {
        const data = await getNegativeStockProducts();
        setProducts(data);
        setTotalCount(data.length);
      } else {
        const { data, count } = await getProductsPaginated({
          search,
          start: range.start,
          end: range.end,
          page,
          pageSize: PAGE_SIZE,
        });
        setProducts(data);
        setTotalCount(count);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFilter, search, range, page]);

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

  const clearUrlFilter = () => {
    setSearchParams({});
    setPage(1);
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setModalOpen(true);
  };

  const handleSaved = () => {
    setModalOpen(false);
    loadProducts();
  };

  const handleDelete = async () => {
    try {
      await deleteProduct(deleteTarget.id);
      toast.success('Product deleted.');
      setDeleteTarget(null);
      loadProducts();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to delete — it may be referenced by a sale or purchase entry.');
    }
  };

  const stockBadge = (p) => {
    if (p.current_stock < 0) return <span className="badge" style={{ background: '#EF4444' }}>{p.current_stock}</span>;
    if (p.current_stock <= p.minimum_stock) return <span className="badge" style={{ background: '#F59E0B' }}>{p.current_stock}</span>;
    return <span className="badge" style={{ background: '#22C55E' }}>{p.current_stock}</span>;
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h4 className="fw-bold mb-0">Stock</h4>
        <button className="btn text-white fw-semibold" style={{ background: '#4F46E5' }} onClick={openAddModal}>
          <i className="fa-solid fa-plus me-2" />
          Add Product
        </button>
      </div>

      <div className="mb-3 d-flex align-items-center gap-2 flex-wrap">
        <input
          className="form-control"
          style={{ maxWidth: 260 }}
          placeholder="Search by name or barcode..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          disabled={Boolean(urlFilter)}
        />
        {!urlFilter && (
          <>
            <DateRangeFilter
              value={range.preset === 'all' ? { preset: 'this_month', ...computeRangeForPreset('this_month') } : range}
              onChange={handleRangeChange}
            />
            <span className="text-secondary" style={{ fontSize: '0.72rem' }}>(filters by date added)</span>
            {range.preset !== 'all' && (
              <button className="btn btn-sm btn-light" onClick={clearRange}>
                <i className="fa-solid fa-xmark me-1" /> Clear Date Filter
              </button>
            )}
          </>
        )}
        {urlFilter && (
          <span className="badge d-flex align-items-center gap-2" style={{ background: urlFilter === 'negative' ? '#EF4444' : '#F59E0B' }}>
            Filtered: {urlFilter === 'negative' ? 'Negative Stock' : 'Low Stock'}
            <button
              className="btn-close btn-close-white"
              style={{ fontSize: '0.6rem' }}
              onClick={clearUrlFilter}
            />
          </span>
        )}
      </div>

      <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr className="text-secondary small">
                <th></th>
                <th>Product</th>
                <th>Category</th>
                <th>Avg. Purchase</th>
                <th>Selling</th>
                <th>Stock</th>
                <th>Min</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-4 text-secondary">Loading...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-4 text-secondary">No products found.</td></tr>
              ) : (
                products.map((p) => (
                  <Fragment key={p.id}>
                    <tr>
                      <td>
                        <button className="btn btn-sm btn-light" onClick={() => toggleBatches(p.id)} title="View purchase batches">
                          <i className={`fa-solid ${expandedId === p.id ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
                        </button>
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          {p.image ? (
                            <img src={p.image} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 8 }} />
                          ) : (
                            <div className="d-flex align-items-center justify-content-center bg-light" style={{ width: 36, height: 36, borderRadius: 8 }}>
                              <i className="fa-solid fa-image text-secondary" />
                            </div>
                          )}
                          <div>
                            <div className="fw-semibold">{p.product_name}</div>
                            {p.barcode && <div className="text-secondary" style={{ fontSize: '0.75rem' }}>{p.barcode}</div>}
                          </div>
                        </div>
                      </td>
                      <td>{p.category}</td>
                      <td>{formatCurrency(p.purchase_price)}</td>
                      <td>{formatCurrency(p.selling_price)}</td>
                      <td>{stockBadge(p)}</td>
                      <td>{p.minimum_stock}</td>
                      <td>
                        <span className={`badge ${p.status === 'active' ? 'bg-success' : 'bg-secondary'}`}>
                          {p.status ?? 'active'}
                        </span>
                      </td>
                      <td className="text-end">
                        <button className="btn btn-sm btn-light me-1" onClick={() => openEditModal(p)}>
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button className="btn btn-sm btn-light text-danger" onClick={() => setDeleteTarget(p)}>
                          <i className="fa-solid fa-trash" />
                        </button>
                      </td>
                    </tr>
                    {expandedId === p.id && (
                      <tr>
                        <td colSpan={9} className="bg-light">
                          <div className="p-3">
                            <h6 className="fw-bold small mb-2">
                              Purchase Batches <span className="text-secondary fw-normal">(oldest sold first — FIFO)</span>
                            </h6>
                            {batchLoading && !batchCache[p.id] ? (
                              <div className="text-secondary small">Loading...</div>
                            ) : (batchCache[p.id] ?? []).length === 0 ? (
                              <div className="text-secondary small">No purchase entries yet for this product.</div>
                            ) : (
                              <table className="table table-sm mb-0 bg-white">
                                <thead>
                                  <tr className="text-secondary small">
                                    <th>Date</th>
                                    <th>Purchase Price</th>
                                    <th>Qty Bought</th>
                                    <th>Remaining</th>
                                    <th>Sold</th>
                                    <th>Supplier</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(batchCache[p.id] ?? []).map((b) => (
                                    <tr key={b.id}>
                                      <td>{formatDateIST(b.date, 'DD MMM YYYY')}</td>
                                      <td>{formatCurrency(b.purchase_price)}</td>
                                      <td>{b.qty}</td>
                                      <td>
                                        <span className={`badge ${b.remaining_qty === 0 ? 'bg-secondary' : 'bg-success'}`}>
                                          {b.remaining_qty}
                                        </span>
                                      </td>
                                      <td className="text-secondary">{b.qty - b.remaining_qty}</td>
                                      <td>{b.supplier || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
        {!urlFilter && (
          <div className="card-body pt-0">
            <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} />
          </div>
        )}
      </div>

      <Modal show={modalOpen} title={editingProduct ? 'Edit Product' : 'Add Product'} onClose={() => setModalOpen(false)} size="modal-lg">
        <ProductForm product={editingProduct} onSaved={handleSaved} onCancel={() => setModalOpen(false)} />
      </Modal>

      <Modal show={Boolean(deleteTarget)} title="Delete Product" onClose={() => setDeleteTarget(null)}>
        <p>
          Delete <strong>{deleteTarget?.product_name}</strong>? This can't be undone, and is logged
          in the activity log.
        </p>
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-light" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
