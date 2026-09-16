import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getAllCustomersForBroadcast } from '../../services/customerService';
import { openWhatsApp } from '../../utils/whatsapp';

const DEFAULT_MESSAGE = 'Hello {name},\n\nNew toys have arrived at Toys Corner. Visit us for a special discount today!';

export default function BulkWhatsAppModal({ onClose }) {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState(null); // null = not started; array = active queue
  const [queueIndex, setQueueIndex] = useState(0);

  useEffect(() => {
    getAllCustomersForBroadcast()
      .then((data) => {
        setCustomers(data);
        setSelected(new Set(data.map((c) => c.id))); // default: everyone selected
      })
      .catch((err) => {
        console.error(err);
        toast.error('Failed to load customers.');
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === customers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(customers.map((c) => c.id)));
    }
  };

  const startQueue = () => {
    const list = customers.filter((c) => selected.has(c.id));
    if (list.length === 0) {
      toast.warn('Select at least one customer.');
      return;
    }
    setQueue(list);
    setQueueIndex(0);
  };

  const sendCurrentAndAdvance = () => {
    const current = queue[queueIndex];
    // Fixed target name = same tab reused for every contact in this queue,
    // instead of opening a fresh WhatsApp Web tab each click.
    openWhatsApp(current.phone, current.name, message, 'toys_corner_whatsapp_broadcast');
    setQueueIndex((i) => i + 1);
  };

  // ---------- Queue in progress view ----------
  if (queue) {
    const done = queueIndex >= queue.length;
    const current = queue[queueIndex];

    return (
      <div>
        <div className="progress mb-3" style={{ height: 8 }}>
          <div
            className="progress-bar"
            style={{ width: `${(queueIndex / queue.length) * 100}%`, background: '#22C55E' }}
          />
        </div>

        {done ? (
          <div className="text-center py-3">
            <i className="fa-solid fa-circle-check fs-1 mb-2" style={{ color: '#22C55E' }} />
            <p className="fw-semibold mb-1">All done — {queue.length} chats opened.</p>
            <p className="text-secondary small">
              Remember: each chat still needs you to tap Send inside WhatsApp — opening the chat doesn't send it automatically.
            </p>
            <button className="btn btn-light mt-2" onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            <p className="text-secondary small mb-3">
              {queueIndex + 1} of {queue.length} — click below to open <strong>{current.name}</strong>'s chat
              with your message pre-filled, then tap Send inside WhatsApp.
            </p>
            <button
              className="btn w-100 text-white fw-semibold mb-2"
              style={{ background: '#22C55E' }}
              onClick={sendCurrentAndAdvance}
            >
              <i className="fa-brands fa-whatsapp me-2" />
              Open Chat with {current.name} ({current.phone})
            </button>
            <button className="btn btn-light w-100" onClick={onClose}>
              Stop Here
            </button>
          </>
        )}
      </div>
    );
  }

  // ---------- Setup view: pick recipients + message ----------
  return (
    <div>
      <div className="alert alert-warning small">
        <i className="fa-solid fa-circle-info me-1" />
        This can't send messages fully automatically — WhatsApp requires a tap to send each one, and
        anything more than that needs the paid WhatsApp Business API. This queue opens each chat
        pre-filled so all you do is tap Send, click Next, repeat.
      </div>

      <label className="form-label small fw-semibold">Message</label>
      <textarea
        className="form-control mb-1"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="text-secondary mb-3" style={{ fontSize: '0.75rem' }}>
        Use <code>{'{name}'}</code> to insert each customer's name automatically.
      </div>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <label className="form-label small fw-semibold mb-0">
          Recipients ({selected.size} of {customers.length} selected)
        </label>
        <button className="btn btn-sm btn-light" onClick={toggleAll}>
          {selected.size === customers.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div className="border rounded mb-3" style={{ maxHeight: 220, overflowY: 'auto' }}>
        {loading ? (
          <div className="text-secondary small p-3">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="text-secondary small p-3">No customers yet.</div>
        ) : (
          customers.map((c) => (
            <label key={c.id} className="d-flex align-items-center gap-2 px-3 py-2 border-bottom small">
              <input
                type="checkbox"
                className="form-check-input m-0"
                checked={selected.has(c.id)}
                onChange={() => toggleOne(c.id)}
              />
              <span className="fw-semibold">{c.name}</span>
              <span className="text-secondary ms-auto">{c.phone}</span>
            </label>
          ))
        )}
      </div>

      <div className="d-flex justify-content-end gap-2">
        <button className="btn btn-light" onClick={onClose}>Cancel</button>
        <button
          className="btn text-white fw-semibold"
          style={{ background: '#22C55E' }}
          onClick={startQueue}
          disabled={selected.size === 0}
        >
          <i className="fa-brands fa-whatsapp me-2" />
          Start Sending ({selected.size})
        </button>
      </div>
    </div>
  );
}
