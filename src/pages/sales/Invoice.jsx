import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import { getSaleWithItems } from '../../services/salesService';
import { getSettings } from '../../services/settingsService';
import { formatCurrency, formatDateIST, formatDiscountLabel } from '../../utils/dateHelpers';
import { generateInvoicePdf } from '../../utils/invoicePdf';

export default function Invoice() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const action = searchParams.get('action'); // 'pdf' | 'invoice' | 'receipt' — auto-triggered once loaded
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printMode, setPrintMode] = useState('invoice'); // 'invoice' (A5) | 'receipt' (80mm thermal)
  // Distinguishes "arrived here via a quick-action icon, print immediately"
  // from "clicked the button on this page, show a preview first" — same
  // receipt view either way, just whether printing fires automatically.
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [result, settingsResult] = await Promise.all([getSaleWithItems(id), getSettings()]);
        if (!cancelled) {
          setData(result);
          setSettings(settingsResult);
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to load invoice.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  // Auto-trigger the requested action once the sale has loaded — used by
  // icon-only shortcuts on the Sales history list and Reports Sales tab,
  // so clicking one icon both opens this page AND fires the action.
  useEffect(() => {
    if (!data || !action) return;

    if (action === 'pdf') {
      generateInvoicePdf(data, settings);
    } else if (action === 'invoice') {
      window.print();
    } else if (action === 'receipt') {
      setAutoPrintReceipt(true);
      setPrintMode('receipt');
    }

    // Clear the param so re-printing later (or a browser refresh) doesn't
    // re-fire the same action unexpectedly.
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, action]);

  // When switching into receipt mode: inject a temporary @page rule sized
  // for 80mm thermal paper. Only auto-fires window.print() if this was
  // reached via a quick-action icon (autoPrintReceipt) — a direct button
  // click on this page just shows the receipt preview, and printing is a
  // separate explicit step via the "Print Now" button below.
  useEffect(() => {
    if (printMode !== 'receipt') return;

    const styleTag = document.createElement('style');
    styleTag.id = 'receipt-page-style';
    styleTag.innerHTML = '@page { size: 80mm auto; margin: 3mm; }';
    document.head.appendChild(styleTag);

    let timer;
    if (autoPrintReceipt) {
      timer = setTimeout(() => window.print(), 50);
    }

    const handleAfterPrint = () => {
      setPrintMode('invoice');
      setAutoPrintReceipt(false);
      document.getElementById('receipt-page-style')?.remove();
    };
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [printMode, autoPrintReceipt]);

  const handlePreviewReceipt = () => {
    setAutoPrintReceipt(false);
    setPrintMode('receipt');
  };

  const handlePrintReceiptNow = () => {
    window.print();
  };

  const handleBackToInvoice = () => {
    document.getElementById('receipt-page-style')?.remove();
    setPrintMode('invoice');
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center vh-100 gap-3">
        <p className="text-secondary">Invoice not found.</p>
        <button className="btn btn-light" onClick={() => navigate('/sales')}>Back to Sales</button>
      </div>
    );
  }

  const { sale, items } = data;

  return (
    <div className="bg-white min-vh-100">
      {/* Screen-only toolbar, hidden when printing */}
      <div className="d-flex justify-content-between align-items-center p-3 border-bottom d-print-none flex-wrap gap-2">
        <button className="btn btn-light" onClick={() => navigate('/sales')}>
          <i className="fa-solid fa-arrow-left me-2" />
          Back to Sales
        </button>

        {printMode === 'invoice' ? (
          <div className="d-flex gap-2 flex-wrap">
            {settings?.enable_download_pdf !== false && (
              <button
                className="btn btn-outline-primary fw-semibold"
                onClick={() => generateInvoicePdf(data, settings)}
              >
                <i className="fa-solid fa-file-arrow-down me-2" />
                Download PDF
              </button>
            )}
            {settings?.enable_print_invoice !== false && (
              <button className="btn text-white fw-semibold" style={{ background: '#4F46E5' }} onClick={() => window.print()}>
                <i className="fa-solid fa-print me-2" />
                Print Invoice (A5)
              </button>
            )}
            {settings?.enable_print_receipt !== false && (
              <button className="btn btn-outline-dark fw-semibold" onClick={handlePreviewReceipt}>
                <i className="fa-solid fa-receipt me-2" />
                Print Receipt (80mm)
              </button>
            )}
          </div>
        ) : (
          <div className="d-flex gap-2 flex-wrap align-items-center">
            <span className="text-secondary small">Receipt preview — 80mm thermal</span>
            <button className="btn btn-light" onClick={handleBackToInvoice}>
              <i className="fa-solid fa-arrow-left me-2" />
              Back to Invoice
            </button>
            <button className="btn text-white fw-semibold" style={{ background: '#22C55E' }} onClick={handlePrintReceiptNow}>
              <i className="fa-solid fa-print me-2" />
              Print Now
            </button>
          </div>
        )}
      </div>

      {/* A5 Invoice — hidden while previewing/printing the receipt */}
      <div className={printMode === 'receipt' ? 'd-none' : ''}>
        <div className="p-4 mx-auto" style={{ maxWidth: 640 }}>
          <div className="text-center mb-4">
            <h3 className="fw-bold mb-0">🧸 {settings?.business_name || 'Toys Corner'}</h3>
            <p className="text-secondary mb-0 small">Invoice</p>
            {settings?.show_address_on_print !== false && settings?.business_address && (
              <p className="text-secondary mb-0" style={{ fontSize: '0.7rem' }}>{settings.business_address}</p>
            )}
            {settings?.show_phone_on_print !== false && settings?.business_phone && (
              <p className="text-secondary mb-0" style={{ fontSize: '0.7rem' }}>Ph: {settings.business_phone}</p>
            )}
            {settings?.show_whatsapp_on_print !== false && settings?.whatsapp_number && (
              <p className="text-secondary mb-0" style={{ fontSize: '0.7rem' }}>WhatsApp: {settings.whatsapp_number}</p>
            )}
            {settings?.show_gst_on_print !== false && settings?.gst && (
              <p className="text-secondary mb-0" style={{ fontSize: '0.7rem' }}>GSTIN: {settings.gst}</p>
            )}
          </div>

          <div className="d-flex justify-content-between mb-3 small">
            <div>
              <div className="fw-semibold">Invoice No: {sale.invoice_no}</div>
              <div className="text-secondary">Date: {formatDateIST(sale.date)}</div>
            </div>
            <div className="text-end">
              <div className="fw-semibold">{sale.customers?.name ?? 'Walk-in Customer'}</div>
              {sale.customers?.phone && <div className="text-secondary">{sale.customers.phone}</div>}
              {sale.customers?.unique_customer_id && (
                <div className="text-secondary">{sale.customers.unique_customer_id}</div>
              )}
            </div>
          </div>

          <table className="table table-sm mb-3">
            <thead>
              <tr className="border-bottom">
                <th>Item</th>
                <th className="text-end">Qty</th>
                <th className="text-end">Price</th>
                <th className="text-end">Discount</th>
                <th className="text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.products?.product_name ?? '—'}</td>
                  <td className="text-end">{item.qty}</td>
                  <td className="text-end">{formatCurrency(item.price)}</td>
                  <td className="text-end">{formatCurrency(item.discount)}</td>
                  <td className="text-end">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-top pt-2">
            <div className="d-flex justify-content-between small">
              <span className="text-secondary">Subtotal</span>
              <span>{formatCurrency(sale.subtotal)}</span>
            </div>
            <div className="d-flex justify-content-between small">
              <span className="text-secondary">Discount</span>
              <span>-{formatDiscountLabel(sale)}</span>
            </div>
            <div className="d-flex justify-content-between fw-bold fs-5 mt-1">
              <span>Grand Total</span>
              <span>{formatCurrency(sale.grand_total)}</span>
            </div>
            <div className="text-secondary small mt-1">Payment Method: {sale.payment_method}</div>
          </div>

          <p className="text-center text-secondary small mt-4 mb-1">Thank you for shopping at Toys Corner!</p>
          <p className="text-center text-secondary mb-0" style={{ fontSize: '0.65rem' }}>Powered by Abronix Technologies</p>
        </div>
      </div>

      {/* 80mm thermal receipt — shown during preview and while printing */}
      <div className={printMode === 'receipt' ? '' : 'd-none'}>
        <div
          className="receipt-print mx-auto p-3"
          style={{
            maxWidth: 302,
            fontFamily: settings?.receipt_font_family === 'monospace' ? "'Courier New', monospace" : "Arial, Helvetica, sans-serif",
            fontSize: settings?.receipt_font_size === 'large' ? '1.05rem' : '0.9rem',
            color: '#000',
            fontWeight: settings?.receipt_font_weight === 'bold' ? 700 : 900,
          }}
        >
          <div className="text-center mb-2">
            <div style={{ fontSize: settings?.receipt_font_size === 'large' ? '1.2rem' : '1.05rem' }}>{(settings?.business_name || 'TOYS CORNER').toUpperCase()}</div>
            {settings?.show_address_on_print !== false && settings?.business_address && (
              <div style={{ fontSize: '0.78rem' }}>{settings.business_address}</div>
            )}
            {settings?.show_phone_on_print !== false && settings?.business_phone && (
              <div style={{ fontSize: '0.78rem' }}>Ph: {settings.business_phone}</div>
            )}
            {settings?.show_whatsapp_on_print !== false && settings?.whatsapp_number && (
              <div style={{ fontSize: '0.78rem' }}>WhatsApp: {settings.whatsapp_number}</div>
            )}
            {settings?.show_gst_on_print !== false && settings?.gst && (
              <div style={{ fontSize: '0.78rem' }}>GSTIN: {settings.gst}</div>
            )}
            <div>{sale.invoice_no}</div>
            <div>{formatDateIST(sale.date, 'DD/MM/YYYY')}</div>
          </div>
          <div className="text-center mb-1" style={{ borderTop: '2px dashed #000' }} />
          <div className="mb-1">{sale.customers?.name ?? 'Walk-in Customer'}</div>
          <div className="mb-2" style={{ borderTop: '2px dashed #000' }} />

          {items.map((item) => (
            <div key={item.id} className="mb-1">
              <div>{item.products?.product_name ?? '—'}</div>
              <div className="d-flex justify-content-between">
                <span>{item.qty} x {formatCurrency(item.price)}</span>
                <span>{formatCurrency(item.total)}</span>
              </div>
            </div>
          ))}

          <div className="mb-1" style={{ borderTop: '2px dashed #000' }} />
          <div className="d-flex justify-content-between">
            <span>Subtotal</span>
            <span>{formatCurrency(sale.subtotal)}</span>
          </div>
          <div className="d-flex justify-content-between">
            <span>Discount</span>
            <span>-{formatDiscountLabel(sale)}</span>
          </div>
          <div className="d-flex justify-content-between fw-bold" style={{ fontSize: '1.05rem' }}>
            <span>TOTAL</span>
            <span>{formatCurrency(sale.grand_total)}</span>
          </div>
          <div className="mt-1" style={{ borderTop: '2px dashed #000' }} />
          <div className="mt-1">Payment: {sale.payment_method}</div>

          <div className="text-center mt-3">Thank you for shopping!</div>
          <div className="text-center">Visit Again</div>
          <div className="text-center mt-2" style={{ fontSize: '0.72rem' }}>Powered by Abronix Technologies</div>
        </div>
      </div>
    </div>
  );
}
