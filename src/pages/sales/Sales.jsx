import { useState, useRef, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import DateRangeFilter, { computeRangeForPreset } from '../../components/ui/DateRangeFilter';
import PaymentBreakdownCards from '../../components/sales/PaymentBreakdownCards';
import BrowseProductsModal from '../../components/sales/BrowseProductsModal';
import BatchPickerModal from '../../components/sales/BatchPickerModal';
import { searchProductsForSale, findProductByBarcode, createSale, getSales, updateSaleDetails, deleteSale, getPaymentMethodBreakdown, getSaleItemsSummary } from '../../services/salesService';
import { searchCustomers, createCustomer } from '../../services/customerService';
import { getProductBatches } from '../../services/productService';
import { getSettings } from '../../services/settingsService';
import { formatCurrency, formatDateIST, getISTDateString } from '../../utils/dateHelpers';

const HISTORY_PAGE_SIZE = 10;

export default function Sales() {
  const navigate = useNavigate();
  const barcodeRef = useRef(null);

  // Product search
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [browseModalOpen, setBrowseModalOpen] = useState(false);
  const [batchMode, setBatchMode] = useState('auto'); // from Settings
  const [batchPickerProduct, setBatchPickerProduct] = useState(null); // product awaiting batch choice
  const [batchPickerOptions, setBatchPickerOptions] = useState([]);

  // Cart
  const [cart, setCart] = useState([]);

  // Customer
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerBirthday, setNewCustomerBirthday] = useState('');

  // Checkout
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState('flat'); // 'flat' (₹) | 'percent' (%)
  const [checkoutDiscountConfig, setCheckoutDiscountConfig] = useState('both'); // from Settings: 'flat' | 'percent' | 'both'
  const [saving, setSaving] = useState(false);

  // Today's Cash/UPI/Card breakdown
  const [paymentBreakdown, setPaymentBreakdown] = useState({
    Cash: { count: 0, total: 0 },
    UPI: { count: 0, total: 0 },
    Card: { count: 0, total: 0 },
  });

  // Sales history (for reprinting past invoices)
  const [recentSales, setRecentSales] = useState([]);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyRange, setHistoryRange] = useState({ preset: 'this_month', ...computeRangeForPreset('this_month') });
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(HISTORY_PAGE_SIZE);
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState(''); // '' | 'Cash' | 'UPI' | 'Card' — set by clicking a breakdown card
  const [expandedSaleId, setExpandedSaleId] = useState(null); // which Recent Sales row shows its full item list
  const [saleItemsCache, setSaleItemsCache] = useState({});

  // Editing an existing sale (header fields only — not line items, see note in salesService)
  const [editingSale, setEditingSale] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editPaymentMethod, setEditPaymentMethod] = useState('Cash');
  const [editDiscount, setEditDiscount] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [editCustomerQuery, setEditCustomerQuery] = useState('');
  const [editCustomerResults, setEditCustomerResults] = useState([]);
  const [editSelectedCustomer, setEditSelectedCustomer] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteSaleTarget, setDeleteSaleTarget] = useState(null);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, count } = await getSales({
        start: historyRange.start,
        end: historyRange.end,
        paymentMethod: historyPaymentFilter || undefined,
        page: historyPage,
        pageSize: historyPageSize,
      });
      setRecentSales(data);
      setHistoryTotalCount(count);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleHistoryPaymentFilterClick = (method) => {
    // Clicking the already-active method clears the filter (toggle off).
    setHistoryPaymentFilter((prev) => (prev === method ? '' : method));
    setHistoryPage(1);
  };

  const handleHistoryPageSizeChange = (size) => {
    setHistoryPageSize(size);
    setHistoryPage(1);
  };

  const toggleSaleItems = async (saleId) => {
    if (expandedSaleId === saleId) {
      setExpandedSaleId(null);
      return;
    }
    setExpandedSaleId(saleId);
    if (!saleItemsCache[saleId]) {
      try {
        const items = await getSaleItemsSummary(saleId);
        setSaleItemsCache((prev) => ({ ...prev, [saleId]: items }));
      } catch (err) {
        console.error(err);
        toast.error('Failed to load items for this sale.');
      }
    }
  };

  const loadPaymentBreakdown = async () => {
    try {
      const today = getISTDateString();
      const data = await getPaymentMethodBreakdown(today, today);
      setPaymentBreakdown(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadPaymentBreakdown();
    getSettings()
      .then((s) => {
        setBatchMode(s?.batch_selection_mode ?? 'auto');
        const configType = s?.default_checkout_discount_type ?? 'both';
        setCheckoutDiscountConfig(configType);
        if (configType !== 'both') setOrderDiscountType(configType);
      })
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyRange, historyPage, historyPaymentFilter, historyPageSize]);

  const handleHistoryRangeChange = (newRange) => {
    setHistoryRange(newRange);
    setHistoryPage(1);
  };

  const clearHistoryRange = () => {
    setHistoryRange({ preset: 'all', start: null, end: null });
    setHistoryPage(1);
  };

  // ---------- Product search ----------
  const handleProductSearch = async (value) => {
    setProductQuery(value);
    if (value.trim().length < 2) {
      setProductResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchProductsForSale(value);
      setProductResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  /**
   * Adds a product to the cart, optionally pinned to one specific purchase
   * batch (Manual mode). When batch is given, the qty for this line is
   * capped at that batch's remaining stock — it represents exactly that
   * batch, not "this product in general."
   */
  const addToCart = (product, batch = null) => {
    setCart((prev) => {
      // In manual mode, the same product+batch combo increments; a
      // different batch for the same product becomes its own separate line
      // (matches "add multiple lines to split across batches" from Settings).
      const matchKey = (item) => item.product_id === product.id && item.selectedBatchId === (batch?.id ?? null);
      const existing = prev.find(matchKey);

      if (existing) {
        const nextQty = batch ? Math.min(existing.qty + 1, batch.remaining_qty) : existing.qty + 1;
        return prev.map((item) => (matchKey(item) ? { ...item, qty: nextQty } : item));
      }

      // Product's configured discount, converted to a flat ₹ amount for this
      // line (percent discounts are computed against the selling price).
      // Still fully editable per-line afterward — this is just the starting
      // value instead of always defaulting to 0.
      const lineDiscount =
        product.discount_type === 'percent'
          ? Number(((product.selling_price * (product.discount || 0)) / 100).toFixed(2))
          : Number(product.discount || 0);

      return [
        ...prev,
        {
          cartItemId: crypto.randomUUID(),
          product_id: product.id,
          name: product.product_name,
          price: product.selling_price,
          qty: 1,
          discount: lineDiscount,
          offer: product.offer || null,
          current_stock: product.current_stock,
          selectedBatchId: batch?.id ?? null,
          selectedBatchLabel: batch ? `${formatDateIST(batch.date, 'DD MMM')} @ ${formatCurrency(batch.purchase_price)}` : null,
          maxQty: batch ? batch.remaining_qty : null, // null = no cap (Automatic mode's usual backorder-allowed behavior)
        },
      ];
    });
    setProductQuery('');
    setProductResults([]);
  };

  /**
   * Entry point used by search results, barcode scan, and Browse All —
   * checks Settings' batch mode and, if Manual with more than one batch
   * available, opens the picker instead of adding directly.
   */
  const handleAddProduct = async (product) => {
    if (batchMode !== 'manual') {
      addToCart(product);
      return;
    }

    try {
      const batches = await getProductBatches(product.id);
      const available = batches.filter((b) => b.remaining_qty > 0);

      if (available.length === 0) {
        // No batch has stock on record (e.g. stock was set directly, or
        // fully depleted) — fall back to unpinned, same as Automatic.
        addToCart(product);
      } else if (available.length === 1) {
        addToCart(product, available[0]);
      } else {
        setBatchPickerProduct(product);
        setBatchPickerOptions(available);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load batches — adding without a pinned batch.');
      addToCart(product);
    }
  };

  const handleBarcodeEnter = async (e) => {
    if (e.key !== 'Enter') return;
    const code = e.target.value.trim();
    if (!code) return;
    try {
      const product = await findProductByBarcode(code);
      if (product) {
        handleAddProduct(product);
      } else {
        toast.warn(`No active product found for barcode "${code}"`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Barcode lookup failed.');
    }
    e.target.value = '';
  };

  const updateCartItem = (cartItemId, field, value) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.cartItemId !== cartItemId) return item;
        if (field === 'qty' && item.maxQty != null && value > item.maxQty) {
          toast.warn(`Only ${item.maxQty} available in this batch.`);
          return { ...item, qty: item.maxQty };
        }
        return { ...item, [field]: value };
      })
    );
  };

  const removeFromCart = (cartItemId) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  };

  // ---------- Customer ----------
  const handleCustomerSearch = async (value) => {
    setCustomerQuery(value);
    setSelectedCustomer(null);
    if (value.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    try {
      const results = await searchCustomers(value);
      setCustomerResults(results);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
      toast.warn('Name and phone are required.');
      return;
    }
    try {
      const customer = await createCustomer({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
        birthday: newCustomerBirthday || null, // optional — stored only if provided
      });
      toast.success(`Customer added (${customer.unique_customer_id})`);
      setSelectedCustomer(customer);
      setCustomerQuery(customer.name);
      setShowNewCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerBirthday('');
    } catch (err) {
      console.error(err);
      toast.error(err.message?.includes('duplicate') ? 'A customer with this phone already exists.' : 'Failed to add customer.');
    }
  };

  // ---------- Totals ----------
  const lineTotal = (item) => item.qty * item.price - (item.discount || 0);
  const subtotal = cart.reduce((sum, item) => sum + lineTotal(item), 0);
  const orderDiscountAmount =
    orderDiscountType === 'percent'
      ? (subtotal * (Number(orderDiscount) || 0)) / 100
      : Number(orderDiscount) || 0;
  const grandTotal = subtotal - orderDiscountAmount;

  const hasBackorderRisk = cart.some((item) => item.qty > item.current_stock);

  // ---------- Edit existing sale (header fields only) ----------
  const openEditSale = (sale) => {
    setEditingSale(sale);
    setEditPaymentMethod(sale.payment_method);
    setEditDiscount(sale.discount);
    setEditNotes(sale.notes ?? '');
    setEditSelectedCustomer(sale.customers ? { id: sale.customer_id, name: sale.customers.name, phone: sale.customers.phone } : null);
    setEditCustomerQuery(sale.customers?.name ?? '');
    setEditCustomerResults([]);
    setEditModalOpen(true);
  };

  const handleEditCustomerSearch = async (value) => {
    setEditCustomerQuery(value);
    setEditSelectedCustomer(null);
    if (value.trim().length < 2) {
      setEditCustomerResults([]);
      return;
    }
    try {
      setEditCustomerResults(await searchCustomers(value));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveEditSale = async () => {
    setEditSaving(true);
    try {
      await updateSaleDetails(editingSale.id, {
        customerId: editSelectedCustomer?.id ?? null,
        paymentMethod: editPaymentMethod,
        discount: Number(editDiscount) || 0,
        notes: editNotes,
      });
      toast.success('Sale updated.');
      setEditModalOpen(false);
      loadHistory();
      loadPaymentBreakdown();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to update sale.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteSale = async () => {
    try {
      await deleteSale(deleteSaleTarget.id);
      toast.success('Sale deleted — stock reversed automatically.');
      setDeleteSaleTarget(null);
      loadHistory();
      loadPaymentBreakdown();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to delete sale.');
    }
  };

  // ---------- Save ----------
  const handleSaveSale = async () => {
    if (cart.length === 0) {
      toast.warn('Cart is empty.');
      return;
    }
    setSaving(true);
    try {
      const result = await createSale({
        customerId: selectedCustomer?.id ?? null,
        paymentMethod,
        discount: orderDiscountAmount,
        discountType: orderDiscountType,
        discountValue: Number(orderDiscount) || 0,
        notes: null,
        items: cart.map((item) => ({
          product_id: item.product_id,
          qty: item.qty,
          price: item.price,
          discount: item.discount || 0,
          selectedBatchId: item.selectedBatchId ?? null,
        })),
      });
      toast.success(`Sale saved — ${result.invoice_no}`);
      loadHistory();
      loadPaymentBreakdown();
      navigate(`/sales/invoice/${result.sale_id}`);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to save sale.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h4 className="fw-bold mb-3">New Sale</h4>

      {/* Today's Cash/UPI/Card breakdown — click a method to filter Recent Sales below */}
      <div className="mb-3">
        <PaymentBreakdownCards
          breakdown={paymentBreakdown}
          compact
          activeMethod={historyPaymentFilter}
          onMethodClick={handleHistoryPaymentFilterClick}
        />
      </div>

      <div className="row g-3">
        {/* Left: product search + cart */}
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: '14px' }}>
            <div className="card-body">
              <div className="row g-2">
                <div className="col-md-6 position-relative">
                  <input
                    className="form-control"
                    placeholder="Search product by name..."
                    value={productQuery}
                    onChange={(e) => handleProductSearch(e.target.value)}
                  />
                  {productResults.length > 0 && (
                    <div
                      className="position-absolute w-100 bg-white border rounded shadow-sm mt-1"
                      style={{ zIndex: 10, maxHeight: 260, overflowY: 'auto' }}
                    >
                      {productResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="btn btn-light w-100 text-start d-flex justify-content-between align-items-center border-0 rounded-0"
                          onClick={() => handleAddProduct(p)}
                        >
                          <span>{p.product_name}</span>
                          <span className="text-secondary small">
                            {formatCurrency(p.selling_price)} · stock: {p.current_stock}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="col-md-3">
                  <input
                    ref={barcodeRef}
                    className="form-control"
                    placeholder="Scan barcode + Enter"
                    onKeyDown={handleBarcodeEnter}
                  />
                </div>
                <div className="col-md-3">
                  <button className="btn btn-outline-primary w-100" onClick={() => setBrowseModalOpen(true)}>
                    <i className="fa-solid fa-list me-1" />
                    Browse All
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
            <div className="card-body">
              <h6 className="fw-bold mb-3">Cart</h6>
              {cart.length === 0 ? (
                <div className="text-secondary text-center py-4">Search a product or scan a barcode to add it here.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table align-middle mb-0">
                    <thead>
                      <tr className="text-secondary small">
                        <th>Product</th>
                        <th style={{ width: 130 }}>Qty</th>
                        <th style={{ width: 150 }}>Price</th>
                        <th style={{ width: 110 }}>Discount</th>
                        <th style={{ width: 110 }}>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item) => (
                        <tr key={item.cartItemId}>
                          <td>
                            {item.name}
                            {item.offer && (
                              <div className="text-danger fw-semibold" style={{ fontSize: '0.7rem' }}>
                                {item.offer}
                              </div>
                            )}
                            {item.selectedBatchLabel && (
                              <div className="text-primary" style={{ fontSize: '0.7rem' }}>
                                <i className="fa-solid fa-box me-1" />
                                Batch: {item.selectedBatchLabel}
                              </div>
                            )}
                            {item.qty > item.current_stock && !item.maxQty && (
                              <div className="text-danger" style={{ fontSize: '0.72rem' }}>
                                Only {item.current_stock} in stock — this sale will go negative
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="d-flex align-items-center gap-1">
                              <button
                                className="btn btn-sm btn-light px-2"
                                onClick={() => updateCartItem(item.cartItemId, 'qty', Math.max(1, item.qty - 1))}
                              >
                                <i className="fa-solid fa-minus" style={{ fontSize: '0.65rem' }} />
                              </button>
                              <input
                                type="number" min="1" max={item.maxQty ?? undefined}
                                className="form-control form-control-sm text-center px-1"
                                style={{ width: 48 }}
                                value={item.qty}
                                onChange={(e) => updateCartItem(item.cartItemId, 'qty', Math.max(1, Number(e.target.value)))}
                              />
                              <button
                                className="btn btn-sm btn-light px-2"
                                onClick={() => updateCartItem(item.cartItemId, 'qty', item.qty + 1)}
                                disabled={item.maxQty != null && item.qty >= item.maxQty}
                              >
                                <i className="fa-solid fa-plus" style={{ fontSize: '0.65rem' }} />
                              </button>
                            </div>
                          </td>
                          <td>
                            <div className="d-flex align-items-center gap-1">
                              <button
                                className="btn btn-sm btn-light px-2"
                                onClick={() => updateCartItem(item.cartItemId, 'price', Math.max(0, Number((item.price - 1).toFixed(2))))}
                              >
                                <i className="fa-solid fa-minus" style={{ fontSize: '0.65rem' }} />
                              </button>
                              <input
                                type="number" min="0" step="0.01"
                                className="form-control form-control-sm text-center px-1"
                                style={{ width: 64 }}
                                value={item.price}
                                onChange={(e) => updateCartItem(item.cartItemId, 'price', Number(e.target.value))}
                              />
                              <button
                                className="btn btn-sm btn-light px-2"
                                onClick={() => updateCartItem(item.cartItemId, 'price', Number((item.price + 1).toFixed(2)))}
                              >
                                <i className="fa-solid fa-plus" style={{ fontSize: '0.65rem' }} />
                              </button>
                            </div>
                          </td>
                          <td>
                            <input
                              type="number" min="0" step="0.01"
                              className="form-control form-control-sm"
                              value={item.discount}
                              onChange={(e) => updateCartItem(item.cartItemId, 'discount', Number(e.target.value))}
                            />
                          </td>
                          <td className="fw-semibold">{formatCurrency(lineTotal(item))}</td>
                          <td>
                            <button className="btn btn-sm btn-light text-danger" onClick={() => removeFromCart(item.cartItemId)}>
                              <i className="fa-solid fa-xmark" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: customer + checkout */}
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: '14px' }}>
            <div className="card-body">
              <h6 className="fw-bold mb-2">Customer</h6>
              {selectedCustomer ? (
                <div className="d-flex justify-content-between align-items-center bg-light rounded p-2">
                  <div>
                    <div className="fw-semibold">{selectedCustomer.name}</div>
                    <div className="text-secondary small">{selectedCustomer.phone}</div>
                  </div>
                  <button className="btn btn-sm btn-light" onClick={() => { setSelectedCustomer(null); setCustomerQuery(''); }}>
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="position-relative mb-2">
                    <input
                      className="form-control"
                      placeholder="Search by name or phone (optional)"
                      value={customerQuery}
                      onChange={(e) => handleCustomerSearch(e.target.value)}
                    />
                    {customerResults.length > 0 && (
                      <div className="position-absolute w-100 bg-white border rounded shadow-sm mt-1" style={{ zIndex: 10 }}>
                        {customerResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="btn btn-light w-100 text-start border-0 rounded-0"
                            onClick={() => {
                              setSelectedCustomer(c);
                              setCustomerQuery(c.name);
                              setCustomerResults([]);
                            }}
                          >
                            {c.name} <span className="text-secondary small">· {c.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {!showNewCustomer ? (
                    <button className="btn btn-sm btn-outline-primary w-100" onClick={() => setShowNewCustomer(true)}>
                      <i className="fa-solid fa-plus me-1" /> New Customer
                    </button>
                  ) : (
                    <div className="border rounded p-2">
                      <input
                        className="form-control form-control-sm mb-2"
                        placeholder="Name"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                      />
                      <input
                        className="form-control form-control-sm mb-2"
                        placeholder="Phone"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                      />
                      <label className="form-label mb-1" style={{ fontSize: '0.72rem' }}>Birthday (optional)</label>
                      <input
                        type="date"
                        className="form-control form-control-sm mb-2"
                        value={newCustomerBirthday}
                        onChange={(e) => setNewCustomerBirthday(e.target.value)}
                      />
                      <div className="d-flex gap-2">
                        <button className="btn btn-sm btn-light flex-fill" onClick={() => { setShowNewCustomer(false); setNewCustomerBirthday(''); }}>Cancel</button>
                        <button className="btn btn-sm text-white flex-fill" style={{ background: '#4F46E5' }} onClick={handleCreateCustomer}>Add</button>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="text-secondary small mt-2">Leave blank for walk-in / cash customer.</div>
            </div>
          </div>

          <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
            <div className="card-body">
              <h6 className="fw-bold mb-3">Checkout</h6>

              <div className="d-flex justify-content-between small mb-2">
                <span className="text-secondary">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>

              <div className="mb-2">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label className="form-label small text-secondary mb-0">
                    Order Discount {orderDiscountType === 'percent' ? '(%)' : '(₹)'}
                  </label>
                  {checkoutDiscountConfig === 'both' && (
                    <div className="btn-group btn-group-sm">
                      <button
                        type="button"
                        className={`btn ${orderDiscountType === 'flat' ? 'text-white' : 'btn-light'}`}
                        style={orderDiscountType === 'flat' ? { background: '#4F46E5' } : {}}
                        onClick={() => setOrderDiscountType('flat')}
                      >
                        Flat ₹
                      </button>
                      <button
                        type="button"
                        className={`btn ${orderDiscountType === 'percent' ? 'text-white' : 'btn-light'}`}
                        style={orderDiscountType === 'percent' ? { background: '#4F46E5' } : {}}
                        onClick={() => setOrderDiscountType('percent')}
                      >
                        %
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="number" min="0" step="0.01"
                  className="form-control form-control-sm"
                  value={orderDiscount}
                  onChange={(e) => setOrderDiscount(e.target.value)}
                />
                {orderDiscountType === 'percent' && Number(orderDiscount) > 0 && (
                  <div className="text-secondary" style={{ fontSize: '0.72rem' }}>
                    = {formatCurrency(orderDiscountAmount)} off
                  </div>
                )}
              </div>

              <div className="d-flex justify-content-between fw-bold fs-5 mb-3">
                <span>Grand Total</span>
                <span>{formatCurrency(grandTotal)}</span>
              </div>

              <label className="form-label small text-secondary mb-1">Payment Method</label>
              <div className="btn-group w-100 mb-3">
                {['Cash', 'UPI', 'Card'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`btn btn-sm ${paymentMethod === m ? 'text-white' : 'btn-light'}`}
                    style={paymentMethod === m ? { background: '#4F46E5' } : {}}
                    onClick={() => setPaymentMethod(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {hasBackorderRisk && (
                <div className="alert alert-warning small py-2">
                  One or more items exceed available stock and will go negative.
                </div>
              )}

              <button
                className="btn w-100 text-white fw-semibold"
                style={{ background: '#22C55E' }}
                disabled={saving || cart.length === 0}
                onClick={handleSaveSale}
              >
                {saving ? 'Saving...' : 'Save & Print Invoice'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sales history — reopen any past sale to reprint or re-download its invoice */}
      <div className="card border-0 shadow-sm mt-3" style={{ borderRadius: '14px' }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <h6 className="fw-bold mb-0">Recent Sales</h6>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <DateRangeFilter
                value={historyRange.preset === 'all' ? { preset: 'this_month', ...computeRangeForPreset('this_month') } : historyRange}
                onChange={handleHistoryRangeChange}
              />
              {historyRange.preset !== 'all' && (
                <button className="btn btn-sm btn-light" onClick={clearHistoryRange}>
                  <i className="fa-solid fa-xmark me-1" /> Clear
                </button>
              )}
            </div>
          </div>
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr className="text-secondary small">
                  <th></th>
                  <th>Invoice No</th>
                  <th>Customer</th>
                  <th>Items Sold</th>
                  <th>Date</th>
                  <th>Payment</th>
                  <th className="text-end">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr><td colSpan={8} className="text-center py-3 text-secondary">Loading...</td></tr>
                ) : recentSales.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-3 text-secondary">No sales yet.</td></tr>
                ) : (
                  recentSales.map((s) => {
                    const cachedItems = saleItemsCache[s.id];
                    const isExpanded = expandedSaleId === s.id;
                    return (
                      <Fragment key={s.id}>
                        <tr>
                          <td>
                            <button className="btn btn-sm btn-light" onClick={() => toggleSaleItems(s.id)} title="Show items">
                              <i className={`fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
                            </button>
                          </td>
                          <td className="fw-semibold">{s.invoice_no}</td>
                          <td>{s.customers?.name ?? 'Walk-in'}</td>
                          <td className="text-secondary" style={{ fontSize: '0.82rem' }}>
                            {cachedItems ? (
                              cachedItems.length === 1 ? (
                                cachedItems[0].name
                              ) : cachedItems.length === 0 ? (
                                '—'
                              ) : (
                                <>
                                  {cachedItems[0].name}
                                  <span className="text-secondary"> +{cachedItems.length - 1} more</span>
                                </>
                              )
                            ) : (
                              <button className="btn btn-sm btn-link p-0 text-decoration-none" style={{ fontSize: '0.78rem' }} onClick={() => toggleSaleItems(s.id)}>
                                View items
                              </button>
                            )}
                          </td>
                          <td>{formatDateIST(s.date, 'DD MMM YYYY')}</td>
                          <td>{s.payment_method}</td>
                          <td className="text-end">{formatCurrency(s.grand_total)}</td>
                          <td className="text-end">
                            <button
                              className="btn btn-sm btn-light me-1"
                              title="Download PDF"
                              onClick={() => navigate(`/sales/invoice/${s.id}?action=pdf`)}
                            >
                              <i className="fa-solid fa-file-arrow-down" />
                            </button>
                            <button
                              className="btn btn-sm btn-light me-1"
                              title="Print Invoice (A5)"
                              onClick={() => navigate(`/sales/invoice/${s.id}?action=invoice`)}
                            >
                              <i className="fa-solid fa-print" />
                            </button>
                            <button
                              className="btn btn-sm btn-light me-1"
                              title="Print Receipt (80mm)"
                              onClick={() => navigate(`/sales/invoice/${s.id}?action=receipt`)}
                            >
                              <i className="fa-solid fa-receipt" />
                            </button>
                            <button className="btn btn-sm btn-light me-1" title="Edit" onClick={() => openEditSale(s)}>
                              <i className="fa-solid fa-pen" />
                            </button>
                            <button className="btn btn-sm btn-light text-danger" title="Delete" onClick={() => setDeleteSaleTarget(s)}>
                              <i className="fa-solid fa-trash" />
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="bg-light">
                              <div className="p-2 ps-4">
                                <div className="fw-semibold small mb-1">Items in {s.invoice_no}:</div>
                                {!cachedItems ? (
                                  <div className="text-secondary small">Loading...</div>
                                ) : cachedItems.length === 0 ? (
                                  <div className="text-secondary small">No items found.</div>
                                ) : (
                                  <ul className="mb-0 small">
                                    {cachedItems.map((item) => (
                                      <li key={item.id}>{item.name} <span className="text-secondary">× {item.qty}</span></li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
                value={historyPageSize}
                onChange={(e) => handleHistoryPageSizeChange(Number(e.target.value))}
              >
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <Pagination page={historyPage} pageSize={historyPageSize} totalCount={historyTotalCount} onPageChange={setHistoryPage} />
          </div>
        </div>
      </div>

      <Modal show={editModalOpen} title={`Edit Sale — ${editingSale?.invoice_no}`} onClose={() => setEditModalOpen(false)}>
        <div className="alert alert-info small py-2">
          Only customer, payment method, discount, and notes can be edited here. To fix wrong items or
          quantities, delete this sale (stock reverses automatically) and re-enter it via New Sale above.
        </div>

        <label className="form-label small fw-semibold">Customer</label>
        {editSelectedCustomer ? (
          <div className="d-flex justify-content-between align-items-center bg-light rounded p-2 mb-2">
            <div>
              <div className="fw-semibold">{editSelectedCustomer.name}</div>
              <div className="text-secondary small">{editSelectedCustomer.phone}</div>
            </div>
            <button className="btn btn-sm btn-light" onClick={() => { setEditSelectedCustomer(null); setEditCustomerQuery(''); }}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        ) : (
          <div className="position-relative mb-2">
            <input
              className="form-control"
              placeholder="Search by name or phone (blank = walk-in)"
              value={editCustomerQuery}
              onChange={(e) => handleEditCustomerSearch(e.target.value)}
            />
            {editCustomerResults.length > 0 && (
              <div className="position-absolute w-100 bg-white border rounded shadow-sm mt-1" style={{ zIndex: 10 }}>
                {editCustomerResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="btn btn-light w-100 text-start border-0 rounded-0"
                    onClick={() => {
                      setEditSelectedCustomer(c);
                      setEditCustomerQuery(c.name);
                      setEditCustomerResults([]);
                    }}
                  >
                    {c.name} <span className="text-secondary small">· {c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="form-label small fw-semibold mt-2">Payment Method</label>
        <div className="btn-group w-100 mb-3">
          {['Cash', 'UPI', 'Card'].map((m) => (
            <button
              key={m}
              type="button"
              className={`btn btn-sm ${editPaymentMethod === m ? 'text-white' : 'btn-light'}`}
              style={editPaymentMethod === m ? { background: '#4F46E5' } : {}}
              onClick={() => setEditPaymentMethod(m)}
            >
              {m}
            </button>
          ))}
        </div>

        <label className="form-label small fw-semibold">Order Discount (₹)</label>
        <input
          type="number" min="0" step="0.01"
          className="form-control mb-3"
          value={editDiscount}
          onChange={(e) => setEditDiscount(e.target.value)}
        />

        <label className="form-label small fw-semibold">Notes</label>
        <textarea className="form-control mb-3" rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />

        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-light" onClick={() => setEditModalOpen(false)}>Cancel</button>
          <button
            className="btn text-white fw-semibold"
            style={{ background: '#4F46E5' }}
            onClick={handleSaveEditSale}
            disabled={editSaving}
          >
            {editSaving ? 'Saving...' : 'Update'}
          </button>
        </div>
      </Modal>

      <Modal show={Boolean(deleteSaleTarget)} title="Delete Sale" onClose={() => setDeleteSaleTarget(null)}>
        <p>
          Delete sale <strong>{deleteSaleTarget?.invoice_no}</strong>? Stock will be restored for every
          item in this sale, and this is logged in the activity log.
        </p>
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-light" onClick={() => setDeleteSaleTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDeleteSale}>Delete</button>
        </div>
      </Modal>

      <Modal show={browseModalOpen} title="Browse All Products" onClose={() => setBrowseModalOpen(false)} size="modal-lg">
        {browseModalOpen && (
          <BrowseProductsModal
            onAdd={(product) => {
              setBrowseModalOpen(false);
              handleAddProduct(product);
            }}
            onClose={() => setBrowseModalOpen(false)}
          />
        )}
      </Modal>

      <Modal
        show={Boolean(batchPickerProduct)}
        title="Choose Purchase Batch"
        onClose={() => { setBatchPickerProduct(null); setBatchPickerOptions([]); }}
      >
        {batchPickerProduct && (
          <BatchPickerModal
            product={batchPickerProduct}
            batches={batchPickerOptions}
            onSelect={(batch) => {
              addToCart(batchPickerProduct, batch);
              toast.success(`${batchPickerProduct.product_name} added (${formatDateIST(batch.date, 'DD MMM')} batch).`);
              setBatchPickerProduct(null);
              setBatchPickerOptions([]);
            }}
            onClose={() => { setBatchPickerProduct(null); setBatchPickerOptions([]); }}
          />
        )}
      </Modal>
    </div>
  );
}
