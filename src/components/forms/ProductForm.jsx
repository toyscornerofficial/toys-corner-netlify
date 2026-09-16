import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { createProduct, updateProduct, uploadProductImage, findProductByExactName } from '../../services/productService';
import { getSettings } from '../../services/settingsService';
import { getCategories } from '../../services/categoryService';
import { supabase } from '../../services/supabaseClient';
import { formatCurrency } from '../../utils/dateHelpers';

// Built-in fallback if no image is uploaded AND no default_product_image is
// configured in Settings — a simple generic gift-box icon, inline as SVG so
// it never depends on an external URL being reachable.
const BUILT_IN_DEFAULT_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <rect width="100" height="100" rx="12" fill="#EEF2FF"/>
      <rect x="20" y="42" width="60" height="38" rx="4" fill="#4F46E5"/>
      <rect x="20" y="30" width="60" height="14" rx="3" fill="#6366F1"/>
      <rect x="46" y="30" width="8" height="50" fill="#EEF2FF"/>
      <path d="M35 30 C35 20 45 18 50 24 C55 18 65 20 65 30 Z" fill="#6366F1"/>
    </svg>
  `);

export default function ProductForm({ product, onSaved, onCancel }) {
  const isEdit = Boolean(product);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(product?.image ?? null);
  const [uploading, setUploading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [shopSettings, setShopSettings] = useState(null);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch((err) => console.error('Failed to load categories:', err));
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: product ?? {
      product_name: '',
      barcode: '',
      category: 'Toys',
      purchase_price: '',
      selling_price: '',
      discount: 0,
      discount_type: 'flat',
      offer: '',
      current_stock: 0,
      minimum_stock: 5,
      status: 'active',
    },
  });

  // Apply shop-wide defaults for a NEW product only — never override an
  // existing product's already-set discount type or barcode on edit.
  useEffect(() => {
    getSettings()
      .then(async (s) => {
        setShopSettings(s);
        if (isEdit) return;

        if (s.default_product_discount_type) {
          setValue('discount_type', s.default_product_discount_type);
        }
        if (s.auto_generate_barcode) {
          setGeneratingBarcode(true);
          try {
            const { data, error } = await supabase.rpc('fn_generate_product_barcode');
            if (!error && data) setValue('barcode', data);
          } catch (err) {
            console.error('Barcode auto-generation failed:', err);
          } finally {
            setGeneratingBarcode(false);
          }
        }
      })
      .catch((err) => console.error('Failed to load settings:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const onSubmit = async (formValues) => {
    try {
      // Catch the "created the same product twice" mistake before it ever
      // reaches the database — only Purchase Entry should add stock to an
      // existing product; Add Product should never be used for restocking.
      const nameChanged = !isEdit || formValues.product_name.trim().toLowerCase() !== product.product_name.trim().toLowerCase();
      if (nameChanged) {
        const existing = await findProductByExactName(formValues.product_name, isEdit ? product.id : undefined);
        if (existing) {
          toast.error(
            `"${existing.product_name}" already exists (stock: ${existing.current_stock}, purchase price: ${formatCurrency(existing.purchase_price)}). ` +
            `To add more stock, use Purchase Entry instead of Add Product — search for it there and log the new quantity/price.`,
            { autoClose: 10000 }
          );
          return;
        }
      }

      let imageUrl = product?.image ?? null;

      if (imageFile) {
        setUploading(true);
        imageUrl = await uploadProductImage(imageFile);
        setUploading(false);
      }

      // No uploaded file and no existing image: fall back to the shop's
      // configured default (Settings -> Business Profile), or the built-in
      // generic icon if none is configured.
      if (!imageUrl) {
        try {
          const settings = await getSettings();
          imageUrl = settings?.default_product_image || BUILT_IN_DEFAULT_IMAGE;
        } catch {
          imageUrl = BUILT_IN_DEFAULT_IMAGE;
        }
      }

      const payload = {
        ...formValues,
        barcode: formValues.barcode?.trim() || null, // '' would collide with other blank barcodes under the unique constraint
        purchase_price: Number(formValues.purchase_price) || 0,
        selling_price: Number(formValues.selling_price),
        discount: Number(formValues.discount) || 0,
        minimum_stock: Number(formValues.minimum_stock),
        image: imageUrl,
      };

      if (isEdit) {
        // current_stock and purchase_price are intentionally NOT sent on
        // edit — both are locked fields, driven only by Purchase Entry.
        delete payload.current_stock;
        delete payload.purchase_price;
        await updateProduct(product.id, payload);
        toast.success('Product updated.');
      } else {
        payload.current_stock = Number(formValues.current_stock) || 0;
        await createProduct(payload);
        toast.success('Product added.');
      }

      onSaved();
    } catch (err) {
      console.error(err);
      if (err.message?.includes('idx_products_name_unique_ci') || err.code === '23505') {
        toast.error('A product with this name already exists. Use Purchase Entry to add stock instead of creating it again.');
      } else {
        toast.error(err.message || 'Something went wrong.');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label small fw-semibold">Product Name</label>
          <input
            className={`form-control ${errors.product_name ? 'is-invalid' : ''}`}
            {...register('product_name', { required: 'Required' })}
          />
          {errors.product_name && <div className="invalid-feedback">{errors.product_name.message}</div>}
        </div>

        <div className="col-md-6">
          <label className="form-label small fw-semibold">Barcode</label>
          <input
            className="form-control"
            disabled={!isEdit && shopSettings?.auto_generate_barcode && generatingBarcode}
            placeholder={!isEdit && shopSettings?.auto_generate_barcode ? 'Auto-generating...' : 'Optional'}
            {...register('barcode')}
          />
          {!isEdit && shopSettings?.auto_generate_barcode && (
            <div className="text-secondary" style={{ fontSize: '0.7rem' }}>
              Auto-generated (Settings → Barcode) — you can still edit it before saving.
            </div>
          )}
        </div>

        <div className="col-md-6">
          <label className="form-label small fw-semibold">Category</label>
          <select className="form-select" {...register('category')}>
            {categories.length === 0 ? (
              <option value="Other">Other</option>
            ) : (
              categories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))
            )}
          </select>
          <div className="text-secondary" style={{ fontSize: '0.7rem' }}>
            Manage categories in Settings → Product Categories.
          </div>
        </div>

        <div className="col-md-6">
          <label className="form-label small fw-semibold">Status</label>
          <select className="form-select" {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="col-md-4">
          <label className="form-label small fw-semibold">
            Avg. Purchase Price (₹) {isEdit && <span className="text-secondary fw-normal">(from batches)</span>}
          </label>
          <input
            type="number" step="0.01"
            className={`form-control ${errors.purchase_price ? 'is-invalid' : ''}`}
            disabled={isEdit}
            {...register('purchase_price', { min: 0 })}
          />
          {errors.purchase_price && <div className="invalid-feedback">Must be 0 or more</div>}
          <div className="text-secondary" style={{ fontSize: '0.72rem' }}>
            {isEdit
              ? 'Weighted average cost of stock currently on hand — recalculates automatically as batches are bought and sold.'
              : 'Optional — auto-fills once you log a Purchase Entry.'}
          </div>
        </div>

        <div className="col-md-4">
          <label className="form-label small fw-semibold">Selling Price (₹)</label>
          <input
            type="number" step="0.01"
            className={`form-control ${errors.selling_price ? 'is-invalid' : ''}`}
            {...register('selling_price', { required: 'Required', min: 0 })}
          />
          {errors.selling_price && <div className="invalid-feedback">Required</div>}
        </div>

        <div className="col-md-4">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <label className="form-label small fw-semibold mb-0">
              Discount {watch('discount_type') === 'percent' ? '(%)' : '(₹)'}
            </label>
            <div className="btn-group btn-group-sm">
              <button
                type="button"
                className={`btn ${watch('discount_type') !== 'percent' ? 'text-white' : 'btn-light'}`}
                style={watch('discount_type') !== 'percent' ? { background: '#4F46E5' } : {}}
                onClick={() => setValue('discount_type', 'flat')}
              >
                Flat ₹
              </button>
              <button
                type="button"
                className={`btn ${watch('discount_type') === 'percent' ? 'text-white' : 'btn-light'}`}
                style={watch('discount_type') === 'percent' ? { background: '#4F46E5' } : {}}
                onClick={() => setValue('discount_type', 'percent')}
              >
                %
              </button>
            </div>
          </div>
          <input type="number" step="0.01" className="form-control" {...register('discount')} />
          <input type="hidden" {...register('discount_type')} />
        </div>

        <div className="col-md-6">
          <label className="form-label small fw-semibold">Offer</label>
          <input className="form-control" placeholder="e.g. Buy 1 Get 1" {...register('offer')} />
          <div className="text-secondary" style={{ fontSize: '0.7rem' }}>
            Shown to the cashier under the product name in the sale cart.
          </div>
        </div>

        <div className="col-md-3">
          <label className="form-label small fw-semibold">
            Current Stock {isEdit && <span className="text-secondary fw-normal">(via Purchase Entry)</span>}
          </label>
          <input
            type="number"
            className="form-control"
            disabled={isEdit}
            {...register('current_stock')}
          />
        </div>

        <div className="col-md-3">
          <label className="form-label small fw-semibold">Minimum Stock</label>
          <input type="number" className="form-control" {...register('minimum_stock', { min: 0 })} />
        </div>

        <div className="col-12">
          <label className="form-label small fw-semibold">Product Image</label>
          <input type="file" accept="image/*" className="form-control" onChange={handleImageChange} />
          {imagePreview && (
            <img
              src={imagePreview}
              alt="preview"
              className="mt-2 rounded border"
              style={{ width: 80, height: 80, objectFit: 'cover' }}
            />
          )}
        </div>
      </div>

      <div className="d-flex justify-content-end gap-2 mt-4">
        <button type="button" className="btn btn-light" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn text-white fw-semibold"
          style={{ background: '#4F46E5' }}
          disabled={isSubmitting || uploading}
        >
          {uploading ? 'Uploading image...' : isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Save'}
        </button>
      </div>
    </form>
  );
}
