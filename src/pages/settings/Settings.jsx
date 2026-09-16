import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';

import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { getSettings, updateSettings, uploadLogo, sendDailyReportNow } from '../../services/settingsService';
import { exportBackup, restoreBackup } from '../../services/backupService';
import { factoryReset } from '../../services/resetService';
import { supabase } from '../../services/supabaseClient';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../services/categoryService';
import { getISTDateString } from '../../utils/dateHelpers';

export default function Settings() {
  const { isAdmin, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [defaultImageFile, setDefaultImageFile] = useState(null);
  const [defaultImagePreview, setDefaultImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState(null);

  // Multi-email recipient management
  const [emails, setEmails] = useState([]);
  const [emailInput, setEmailInput] = useState('');

  // Manual "Send Now" report
  const [sendDate, setSendDate] = useState(getISTDateString());
  const [sendingNow, setSendingNow] = useState(false);

  // Danger Zone: Factory Reset
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState(null);

  // Product Categories
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm({
    defaultValues: {
      business_name: '',
      gst: '',
      whatsapp_number: '',
      business_address: '',
      business_phone: '',
      show_address_on_print: true,
      show_phone_on_print: true,
      show_gst_on_print: true,
      show_whatsapp_on_print: true,
      receipt_font_family: 'sans',
      receipt_font_weight: 'extrabold',
      receipt_font_size: 'normal',
      enable_download_pdf: true,
      enable_print_invoice: true,
      enable_print_receipt: true,
      daily_report_enabled: true,
      daily_report_time: '21:00',
      stock_reminder_enabled: true,
      batch_selection_mode: 'auto',
      default_product_discount_type: 'flat',
      default_checkout_discount_type: 'both',
      auto_generate_barcode: false,
      smtp_host: '',
      smtp_port: '',
      smtp_user: '',
      smtp_password: '',
      smtp_enable_ssl: true,
    },
  });

  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  const loadCategories = async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load categories.');
    }
  };

  useEffect(() => {
    getSettings()
      .then((data) => {
        reset(data);
        setLogoPreview(data.logo);
        setDefaultImagePreview(data.default_product_image);
        setEmails(
          (data.notification_email ?? '')
            .split(',')
            .map((e) => e.trim())
            .filter((e) => e.length > 0)
        );
      })
      .catch((err) => {
        console.error(err);
        toast.error('Failed to load settings.');
      })
      .finally(() => setLoading(false));
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await createCategory(newCategoryName);
      setNewCategoryName('');
      toast.success('Category added.');
      loadCategories();
    } catch (err) {
      console.error(err);
      toast.error(err.message?.includes('duplicate') ? 'That category already exists.' : 'Failed to add category.');
    }
  };

  const startEditCategory = (category) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const handleUpdateCategory = async (id) => {
    if (!editingCategoryName.trim()) return;
    try {
      await updateCategory(id, editingCategoryName);
      setEditingCategoryId(null);
      toast.success('Category updated.');
      loadCategories();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update category.');
    }
  };

  const handleDeleteCategory = async (category) => {
    if (!window.confirm(`Delete category "${category.name}"? Products already using it keep their existing value.`)) return;
    try {
      await deleteCategory(category.id);
      toast.success('Category deleted.');
      loadCategories();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete category.');
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleDefaultImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDefaultImageFile(file);
    setDefaultImagePreview(URL.createObjectURL(file));
  };

  // ---------- Multi-email chip management ----------
  const addEmail = () => {
    const value = emailInput.trim().replace(/,$/, '');
    if (!value) return;
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (!isValid) {
      toast.warn('Enter a valid email address.');
      return;
    }
    if (emails.includes(value)) {
      setEmailInput('');
      return;
    }
    setEmails((prev) => [...prev, value]);
    setEmailInput('');
  };

  const handleEmailKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail();
    }
  };

  const removeEmail = (email) => {
    setEmails((prev) => prev.filter((e) => e !== email));
  };

  const onSubmit = async (values) => {
    setSaving(true);
    try {
      let logoUrl = values.logo;
      if (logoFile) {
        logoUrl = await uploadLogo(logoFile);
      }
      let defaultImageUrl = values.default_product_image;
      if (defaultImageFile) {
        defaultImageUrl = await uploadLogo(defaultImageFile); // reuses the same public bucket
      }

      const updated = await updateSettings({
        ...values,
        logo: logoUrl,
        default_product_image: defaultImageUrl,
        notification_email: emails.join(', '),
      });
      reset(updated);
      setLogoFile(null);
      setDefaultImageFile(null);
      toast.success('Settings saved.');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportBackup();
      toast.success(`Backup downloaded: ${result.filename}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to export backup.');
    } finally {
      setExporting(false);
    }
  };

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmed = window.confirm(
      'Restoring will overwrite Products, Customers, Expenses, Inquiries, and Settings with the data in this backup file. Sales, Purchase Entries, and Sale Items are NOT restored (see note below). Continue?'
    );
    if (!confirmed) {
      e.target.value = '';
      return;
    }

    setRestoring(true);
    setRestoreSummary(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const result = await restoreBackup(json);
      setRestoreSummary(result);
      toast.success('Restore complete.');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to restore — check the file is a valid Toys Corner backup.');
    } finally {
      setRestoring(false);
      e.target.value = '';
    }
  };

  const handleSendNow = async () => {
    if (emails.length === 0) {
      toast.warn('Add at least one notification email and save settings first.');
      return;
    }
    setSendingNow(true);
    try {
      const result = await sendDailyReportNow(sendDate);
      if (result?.skipped) {
        toast.warn(`Not sent: ${result.reason}`);
      } else {
        toast.success(`Report sent for ${sendDate} to ${result.to?.join(', ')}`);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to send — check the Edge Function is deployed (see supabase/functions/README.md).');
    } finally {
      setSendingNow(false);
    }
  };

  const handleFactoryReset = async () => {
    if (resetConfirmText.trim() !== 'RESET') {
      toast.warn('Type RESET exactly to confirm.');
      return;
    }
    if (!resetPassword) {
      toast.warn('Enter your account password to confirm.');
      return;
    }

    setResetting(true);
    try {
      // Re-authenticate as a genuine password check before doing anything
      // destructive — this doesn't change the current session, it just
      // verifies the password is correct for the logged-in Admin's email.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: resetPassword,
      });
      if (authError) {
        toast.error('Incorrect password — reset cancelled.');
        setResetting(false);
        return;
      }

      const result = await factoryReset();
      setResetResult(result);
      toast.success('Database reset complete.');
      setResetConfirmText('');
      setResetPassword('');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Reset failed partway through — check the console and your data state carefully.');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '40vh' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div>
        <h4 className="fw-bold mb-3">Settings</h4>
        <div className="alert alert-warning">
          Settings are only editable by an Admin. Contact your shop admin for changes.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h4 className="fw-bold mb-4">Settings</h4>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Business Profile */}
        <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: '14px' }}>
          <div className="card-body">
            <h6 className="fw-bold mb-3">Business Profile</h6>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Business Name</label>
                <input className="form-control" {...register('business_name')} />
                <div className="text-secondary" style={{ fontSize: '0.7rem' }}>Shown in the sidebar and on every printed invoice/receipt.</div>
              </div>

              <div className="col-md-8">
                <label className="form-label small fw-semibold">GST Number</label>
                <input className="form-control" {...register('gst')} />
              </div>
              <div className="col-md-4 d-flex align-items-end pb-1">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" role="switch" id="show_gst_on_print" {...register('show_gst_on_print')} />
                  <label className="form-check-label small" htmlFor="show_gst_on_print">Show on printed invoices/receipts</label>
                </div>
              </div>

              <div className="col-md-8">
                <label className="form-label small fw-semibold">WhatsApp Number</label>
                <input className="form-control" placeholder="e.g. 9876543210" {...register('whatsapp_number')} />
              </div>
              <div className="col-md-4 d-flex align-items-end pb-1">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" role="switch" id="show_whatsapp_on_print" {...register('show_whatsapp_on_print')} />
                  <label className="form-check-label small" htmlFor="show_whatsapp_on_print">Show on printed invoices/receipts</label>
                </div>
              </div>

              <div className="col-md-8">
                <label className="form-label small fw-semibold">Business Address</label>
                <input className="form-control" placeholder="e.g. B2, IP Mission Arcade, Station Road, Anand, Gujarat 388001" {...register('business_address')} />
              </div>
              <div className="col-md-4 d-flex align-items-end pb-1">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" role="switch" id="show_address_on_print" {...register('show_address_on_print')} />
                  <label className="form-check-label small" htmlFor="show_address_on_print">Show on printed invoices/receipts</label>
                </div>
              </div>

              <div className="col-md-8">
                <label className="form-label small fw-semibold">Business Phone Number(s)</label>
                <input className="form-control" placeholder="e.g. 7600116893, 8487891759" {...register('business_phone')} />
              </div>
              <div className="col-md-4 d-flex align-items-end pb-1">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" role="switch" id="show_phone_on_print" {...register('show_phone_on_print')} />
                  <label className="form-check-label small" htmlFor="show_phone_on_print">Show on printed invoices/receipts</label>
                </div>
              </div>

              <div className="col-md-6">
                <label className="form-label small fw-semibold">Shop Logo</label>
                <input type="file" accept="image/*" className="form-control" onChange={handleLogoChange} />
                {logoPreview && (
                  <img src={logoPreview} alt="logo" className="mt-2 rounded border" style={{ width: 64, height: 64, objectFit: 'cover' }} />
                )}
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Default Product Image</label>
                <input type="file" accept="image/*" className="form-control" onChange={handleDefaultImageChange} />
                <div className="text-secondary small mt-1">
                  Used automatically whenever a product is added without its own photo.
                </div>
                {defaultImagePreview && (
                  <img src={defaultImagePreview} alt="default" className="mt-2 rounded border" style={{ width: 64, height: 64, objectFit: 'cover' }} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Print Options */}
        <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: '14px' }}>
          <div className="card-body">
            <h6 className="fw-bold mb-1">Print Options</h6>
            <p className="text-secondary small mb-3">
              Turn off any print action you don't need — e.g. disable "Print Receipt" entirely if
              the shop has no thermal printer. Disabled buttons are hidden from the invoice page.
            </p>
            <div className="row g-3">
              <div className="col-md-4">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" role="switch" id="enable_download_pdf" {...register('enable_download_pdf')} />
                  <label className="form-check-label small fw-semibold" htmlFor="enable_download_pdf">Download PDF</label>
                </div>
              </div>
              <div className="col-md-4">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" role="switch" id="enable_print_invoice" {...register('enable_print_invoice')} />
                  <label className="form-check-label small fw-semibold" htmlFor="enable_print_invoice">Print Invoice (A5)</label>
                </div>
              </div>
              <div className="col-md-4">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" role="switch" id="enable_print_receipt" {...register('enable_print_receipt')} />
                  <label className="form-check-label small fw-semibold" htmlFor="enable_print_receipt">Print Receipt (80mm)</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Receipt Print Style */}
        <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: '14px' }}>
          <div className="card-body">
            <h6 className="fw-bold mb-1">Receipt Print Style</h6>
            <p className="text-secondary small mb-3">
              Some thermal printers render certain fonts lighter or thinner than others. Try a
              combination below, save, then print a test receipt from Sales → Recent Sales to compare —
              switch anytime, no code changes needed.
            </p>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label small fw-semibold">Font</label>
                <select className="form-select" {...register('receipt_font_family')}>
                  <option value="sans">Sans-serif (bolder, usually darker on thermal)</option>
                  <option value="monospace">Monospace (classic receipt look)</option>
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-semibold">Weight</label>
                <select className="form-select" {...register('receipt_font_weight')}>
                  <option value="extrabold">Extra Bold (darkest)</option>
                  <option value="bold">Bold</option>
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-semibold">Size</label>
                <select className="form-select" {...register('receipt_font_size')}>
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Discounts & Barcode */}
        <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: '14px' }}>
          <div className="card-body">
            <h6 className="fw-bold mb-3">Discounts & Barcode</h6>

            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Default Product Discount Type</label>
                <select className="form-select" {...register('default_product_discount_type')}>
                  <option value="flat">Flat ₹</option>
                  <option value="percent">Percentage %</option>
                </select>
                <div className="text-secondary" style={{ fontSize: '0.7rem' }}>
                  Pre-selected when adding a new product — can still be changed per product.
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Checkout Order Discount</label>
                <select className="form-select" {...register('default_checkout_discount_type')}>
                  <option value="both">Let cashier choose (Flat or %)</option>
                  <option value="flat">Flat ₹ only</option>
                  <option value="percent">Percentage % only</option>
                </select>
                <div className="text-secondary" style={{ fontSize: '0.7rem' }}>
                  Controls the Order Discount option shown on the New Sale checkout.
                </div>
              </div>
            </div>

            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" role="switch" id="auto_generate_barcode" {...register('auto_generate_barcode')} />
              <label className="form-check-label small fw-semibold" htmlFor="auto_generate_barcode">
                Auto-generate barcodes (starting with "P")
              </label>
            </div>
            <div className="text-secondary" style={{ fontSize: '0.7rem' }}>
              When on, Add Product pre-fills a unique barcode like P000123 — still editable, and barcode
              stays optional either way.
            </div>
          </div>
        </div>

        {/* Inventory */}
        <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: '14px' }}>
          <div className="card-body">
            <h6 className="fw-bold mb-1">Inventory — Batch Selection</h6>
            <p className="text-secondary small mb-3">
              How stock is drawn from purchase batches when a product with multiple purchase prices is sold.
              Switch anytime to compare — this only affects new sales going forward.
            </p>
            <div className="d-flex flex-column gap-2">
              <label className="d-flex align-items-start gap-2 p-2 border rounded" style={{ cursor: 'pointer' }}>
                <input type="radio" className="form-check-input mt-1" value="auto" {...register('batch_selection_mode')} />
                <span>
                  <span className="fw-semibold small d-block">Automatic (FIFO) — Recommended</span>
                  <span className="text-secondary" style={{ fontSize: '0.78rem' }}>
                    Oldest purchase batch is used first automatically. The cashier doesn't need to do anything extra —
                    same search, same cart. Matches how most POS systems work.
                  </span>
                </span>
              </label>
              <label className="d-flex align-items-start gap-2 p-2 border rounded" style={{ cursor: 'pointer' }}>
                <input type="radio" className="form-check-input mt-1" value="manual" {...register('batch_selection_mode')} />
                <span>
                  <span className="fw-semibold small d-block">Manual Selection</span>
                  <span className="text-secondary" style={{ fontSize: '0.78rem' }}>
                    When a product has more than one purchase batch with stock, the cashier picks which
                    one to sell from at the time of sale — useful if you want to deliberately clear older
                    stock first, or batches differ in quality/expiry.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Product Categories */}
        <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: '14px' }}>
          <div className="card-body">
            <h6 className="fw-bold mb-3">Product Categories</h6>
            <div className="d-flex gap-2 mb-3">
              <input
                className="form-control"
                style={{ maxWidth: 280 }}
                placeholder="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
              />
              <button type="button" className="btn text-white fw-semibold" style={{ background: '#4F46E5' }} onClick={handleAddCategory}>
                <i className="fa-solid fa-plus me-1" /> Add
              </button>
            </div>
            <div className="d-flex flex-wrap gap-2">
              {categories.map((cat) => (
                <div key={cat.id} className="d-flex align-items-center gap-1 border rounded-pill ps-3 pe-2 py-1">
                  {editingCategoryId === cat.id ? (
                    <>
                      <input
                        className="form-control form-control-sm border-0 p-0"
                        style={{ width: 100 }}
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateCategory(cat.id)}
                        autoFocus
                      />
                      <button className="btn btn-sm btn-link p-0" onClick={() => handleUpdateCategory(cat.id)}>
                        <i className="fa-solid fa-check text-success" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="small">{cat.name}</span>
                      <button className="btn btn-sm btn-link p-0 text-secondary" onClick={() => startEditCategory(cat)}>
                        <i className="fa-solid fa-pen" style={{ fontSize: '0.7rem' }} />
                      </button>
                      <button className="btn btn-sm btn-link p-0 text-danger" onClick={() => handleDeleteCategory(cat)}>
                        <i className="fa-solid fa-xmark" style={{ fontSize: '0.8rem' }} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Email & Automation */}
        <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: '14px' }}>
          <div className="card-body">
            <h6 className="fw-bold mb-1">Email & Automation</h6>
            <p className="text-secondary small mb-3">
              The daily report includes: <strong>Today's Sales, Expenses, Profit, Orders, Customers, Items Sold,
              Top Selling Product, Low Stock details (with suggested purchase quantities), Negative Stock, and Pending Inquiries.</strong>
            </p>

            <label className="form-label small fw-semibold">Notification Email(s)</label>
            <div className="border rounded p-2 mb-1 d-flex flex-wrap gap-2 align-items-center">
              {emails.map((email) => (
                <span key={email} className="badge d-flex align-items-center gap-2" style={{ background: '#4F46E5' }}>
                  {email}
                  <button
                    type="button"
                    className="btn-close btn-close-white"
                    style={{ fontSize: '0.55rem' }}
                    onClick={() => removeEmail(email)}
                  />
                </span>
              ))}
              <input
                type="email"
                className="border-0 flex-grow-1"
                style={{ outline: 'none', minWidth: 160 }}
                placeholder="Add email, press Enter"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={handleEmailKeyDown}
                onBlur={addEmail}
              />
            </div>
            <div className="text-secondary small mb-3">
              Add as many recipients as you want — press Enter or comma after each one.
            </div>

            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Daily Report Time</label>
                <input type="time" className="form-control" {...register('daily_report_time')} />
              </div>
              <div className="col-md-6 mt-4">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" role="switch" id="daily_report_enabled" {...register('daily_report_enabled')} />
                  <label className="form-check-label small" htmlFor="daily_report_enabled">Send daily report email (scheduled)</label>
                </div>
              </div>
              <div className="col-md-6 mt-4">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" role="switch" id="stock_reminder_enabled" {...register('stock_reminder_enabled')} />
                  <label className="form-check-label small" htmlFor="stock_reminder_enabled">Include low-stock reminder in report</label>
                </div>
              </div>
            </div>

            <hr className="my-3" />

            <h6 className="fw-bold small mb-2">Send Report Manually</h6>
            <p className="text-secondary small mb-2">
              Use this if the scheduled report didn't go out, or to (re)send a past day's report.
            </p>
            <div className="d-flex gap-2 flex-wrap align-items-end mb-2">
              <div>
                <label className="form-label small fw-semibold mb-1">Date</label>
                <input type="date" className="form-control form-control-sm" value={sendDate} onChange={(e) => setSendDate(e.target.value)} />
              </div>
              <button type="button" className="btn btn-sm text-white fw-semibold" style={{ background: '#22C55E' }} onClick={handleSendNow} disabled={sendingNow}>
                <i className="fa-solid fa-paper-plane me-1" />
                {sendingNow ? 'Sending...' : 'Send Report Now'}
              </button>
            </div>
            <div className="text-secondary small">
              Requires the Edge Function to be deployed once — see <code>supabase/functions/README.md</code>.
            </div>

            <hr className="my-3" />

            <h6 className="fw-bold small mb-2">Gmail SMTP Setup (optional)</h6>
            <p className="text-secondary small mb-2">
              The daily report currently sends via <strong>Resend</strong> (recommended — simpler, free tier
              covers this easily). If you'd rather send from your own Gmail address instead:
            </p>
            <ol className="text-secondary small mb-2" style={{ paddingLeft: '1.1rem' }}>
              <li>Turn on 2-Step Verification on your Google account (Google Account → Security)</li>
              <li>Go to Google Account → Security → App Passwords, and generate one for "Mail"</li>
              <li>Use that generated 16-character password below — <strong>not</strong> your normal Gmail password</li>
              <li>SMTP Host: <code>smtp.gmail.com</code>, Port: <code>587</code>, User: your full Gmail address</li>
            </ol>
            <p className="text-secondary small mb-2">
              Fill in all 4 fields below (Host, Port, User, Password) and the daily report will send via
              Gmail SMTP automatically instead of Resend. Leave any one blank and it falls back to Resend.
            </p>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label small fw-semibold">SMTP Host</label>
                <input className="form-control" placeholder="smtp.gmail.com" {...register('smtp_host')} />
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-semibold">SMTP Port</label>
                <input type="number" className="form-control" placeholder="587" {...register('smtp_port')} />
              </div>
              <div className="col-md-4 d-flex align-items-end pb-1">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" role="switch" id="smtp_enable_ssl" {...register('smtp_enable_ssl')} />
                  <label className="form-check-label small" htmlFor="smtp_enable_ssl">
                    Enable SSL <span className="text-secondary">(on for port 465, off for 587/STARTTLS)</span>
                  </label>
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">SMTP User</label>
                <input className="form-control" placeholder="you@gmail.com" {...register('smtp_user')} />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">SMTP Password (App Password)</label>
                <div className="input-group">
                  <input
                    type={showSmtpPassword ? 'text' : 'password'}
                    className="form-control"
                    placeholder="16-character App Password from Google"
                    autoComplete="new-password"
                    {...register('smtp_password')}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowSmtpPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    <i className={`fa-solid ${showSmtpPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </div>
            </div>
            <div className="alert alert-warning small mt-3 mb-0">
              <i className="fa-solid fa-triangle-exclamation me-1" />
              <strong>Security note:</strong> this is stored as plain text in the database, readable by
              both Admin and Staff (matching this app's shared-access design). Only ever paste a Google
              <strong> App Password</strong> here — never your actual Gmail account password — since an
              App Password can be revoked independently from your Google Account at any time without
              affecting your regular login.
            </div>
          </div>
        </div>

        <button type="submit" className="btn text-white fw-semibold mb-3" style={{ background: '#4F46E5' }} disabled={saving || (!isDirty && emails.length === 0)}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>

      {/* Backup & Restore */}
      <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
        <div className="card-body">
          <h6 className="fw-bold mb-3">Backup & Restore</h6>

          <div className="mb-4">
            <p className="text-secondary small mb-2">
              Downloads a complete snapshot — Products, Customers, Sales, Sale Items, Purchase Entries, Expenses, Inquiries, and Settings — as one JSON file.
            </p>
            <button className="btn btn-outline-primary fw-semibold" onClick={handleExport} disabled={exporting}>
              <i className="fa-solid fa-download me-2" />
              {exporting ? 'Exporting...' : 'Download Backup'}
            </button>
          </div>

          <hr />

          <div className="alert alert-warning small">
            <i className="fa-solid fa-triangle-exclamation me-1" />
            <strong>Restore only covers Products, Customers, Expenses, Inquiries, and Settings.</strong>{' '}
            Sales, Sale Items, and Purchase Entries are deliberately <strong>not</strong> restored — those
            tables automatically adjust stock numbers on every insert, so restoring them here would
            silently double-count stock changes that already happened once. For a full historical
            restore including sales/purchase records, that needs to be done directly in Supabase with
            database triggers temporarily disabled — beyond what this in-app tool can safely do.
          </div>

          <label className="form-label small fw-semibold">Restore from Backup File</label>
          <input type="file" accept=".json" className="form-control mb-2" onChange={handleRestoreFile} disabled={restoring} />

          {restoreSummary && (
            <div className="mt-2 small">
              <div className="fw-semibold mb-1">Restored:</div>
              <ul className="mb-2">
                {Object.entries(restoreSummary.restored).map(([table, count]) => (
                  <li key={table}>{table}: {count} rows</li>
                ))}
              </ul>
              {restoreSummary.skipped.length > 0 && (
                <div className="text-secondary">
                  Skipped (not safe to auto-restore): {restoreSummary.skipped.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card border-0 shadow-sm mt-3" style={{ borderRadius: '14px', border: '1px solid #FCA5A5' }}>
        <div className="card-body">
          <h6 className="fw-bold mb-2 text-danger">
            <i className="fa-solid fa-skull-crossbones me-2" />
            Danger Zone
          </h6>
          <p className="text-secondary small mb-3">
            Permanently deletes every Product, Customer, Sale, Purchase Entry, Expense, and Inquiry —
            then inserts 2 sample products and 2 sample customers so the app isn't completely empty.
            Business info in Settings is left untouched. <strong>This cannot be undone</strong> — download
            a backup first if there's any chance you'll want this data back.
          </p>
          <button className="btn btn-outline-danger fw-semibold" onClick={() => setResetModalOpen(true)}>
            <i className="fa-solid fa-trash-can me-2" />
            Reset Database
          </button>

          {resetResult && (
            <div className="mt-3 small">
              <div className="fw-semibold mb-1">Reset complete:</div>
              <ul className="mb-0">
                {Object.entries(resetResult.deletedCounts).map(([table, count]) => (
                  <li key={table}>{table}: {count} rows deleted</li>
                ))}
                <li>Reseeded: {resetResult.reseeded.products} sample products, {resetResult.reseeded.customers} sample customers</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      <Modal
        show={resetModalOpen}
        title="Reset Database — This Cannot Be Undone"
        onClose={() => {
          setResetModalOpen(false);
          setResetConfirmText('');
          setResetPassword('');
        }}
      >
        <div className="alert alert-danger small">
          <i className="fa-solid fa-triangle-exclamation me-1" />
          This permanently deletes all Products, Customers, Sales, Purchase Entries, Expenses, and
          Inquiries, and replaces them with 2 sample products and 2 sample customers. There is no undo.
          Consider downloading a backup first (above) if you're not certain.
        </div>

        <label className="form-label small fw-semibold">
          Type <code>RESET</code> to confirm
        </label>
        <input
          className="form-control mb-3"
          value={resetConfirmText}
          onChange={(e) => setResetConfirmText(e.target.value)}
          placeholder="RESET"
        />

        <label className="form-label small fw-semibold">Confirm your account password</label>
        <input
          type="password"
          className="form-control mb-3"
          value={resetPassword}
          onChange={(e) => setResetPassword(e.target.value)}
          placeholder="Your login password"
        />

        <div className="d-flex justify-content-end gap-2">
          <button
            className="btn btn-light"
            onClick={() => {
              setResetModalOpen(false);
              setResetConfirmText('');
              setResetPassword('');
            }}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger fw-semibold"
            onClick={handleFactoryReset}
            disabled={resetting || resetConfirmText.trim() !== 'RESET' || !resetPassword}
          >
            {resetting ? 'Resetting...' : 'Permanently Reset'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
