import { useState } from 'react';
import { formatCurrency, formatDateIST } from '../../utils/dateHelpers';

export default function BatchPickerModal({ product, batches, onSelect, onClose }) {
  const [selectedId, setSelectedId] = useState(batches[0]?.id ?? null);

  const selectedBatch = batches.find((b) => b.id === selectedId);

  return (
    <div>
      <p className="text-secondary small mb-3">
        <strong>{product.product_name}</strong> has stock from more than one purchase batch. Choose which one this sale draws from.
      </p>

      <div className="d-flex flex-column gap-2 mb-3">
        {batches.map((b) => (
          <label
            key={b.id}
            className={`d-flex align-items-center gap-2 p-2 border rounded ${selectedId === b.id ? 'border-primary' : ''}`}
            style={{ cursor: 'pointer' }}
          >
            <input
              type="radio"
              className="form-check-input"
              checked={selectedId === b.id}
              onChange={() => setSelectedId(b.id)}
            />
            <span style={{ flex: 1 }}>
              <span className="fw-semibold small d-block">
                Purchased {formatDateIST(b.date, 'DD MMM YYYY')} — {formatCurrency(b.purchase_price)} each
              </span>
              <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
                {b.remaining_qty} remaining{b.supplier ? ` · ${b.supplier}` : ''}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="d-flex justify-content-end gap-2">
        <button className="btn btn-light" onClick={onClose}>Cancel</button>
        <button
          className="btn text-white fw-semibold"
          style={{ background: '#4F46E5' }}
          disabled={!selectedBatch}
          onClick={() => onSelect(selectedBatch)}
        >
          Use This Batch
        </button>
      </div>
    </div>
  );
}
