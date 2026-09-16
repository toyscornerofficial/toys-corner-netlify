import { useEffect, useState } from 'react';
import { getAllProductsForSale } from '../../services/salesService';
import { formatCurrency } from '../../utils/dateHelpers';

export default function BrowseProductsModal({ onAdd, onClose }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    getAllProductsForSale()
      .then(setProducts)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const categories = ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];
  const [categoryFilter, setCategoryFilter] = useState('All');

  const filtered = products.filter((p) => {
    const matchesText = p.product_name.toLowerCase().includes(filter.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
    return matchesText && matchesCategory;
  });

  return (
    <div>
      <div className="d-flex gap-2 mb-3">
        <input
          className="form-control"
          placeholder="Filter this list..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />
        <select className="form-select" style={{ maxWidth: 160 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {loading ? (
          <div className="text-center py-4 text-secondary">Loading products...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-4 text-secondary">No products match.</div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {filtered.map((p) => (
              <div key={p.id} className="d-flex align-items-center gap-3 border rounded p-2">
                {p.image ? (
                  <img src={p.image} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                ) : (
                  <div className="d-flex align-items-center justify-content-center bg-light" style={{ width: 40, height: 40, borderRadius: 6 }}>
                    <i className="fa-solid fa-image text-secondary" />
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="fw-semibold text-truncate">{p.product_name}</div>
                  <div className="text-secondary small">
                    {formatCurrency(p.selling_price)} · stock: {p.current_stock} · {p.category}
                  </div>
                </div>
                <button
                  className="btn btn-sm text-white fw-semibold"
                  style={{ background: '#4F46E5' }}
                  onClick={() => onAdd(p)}
                >
                  <i className="fa-solid fa-plus me-1" /> Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="d-flex justify-content-end mt-3">
        <button className="btn btn-light" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
