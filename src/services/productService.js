import { supabase } from './supabaseClient';

const BUCKET = 'product-images';

export async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * Paginated, filterable product list for the Stock page — filters by name/
 * barcode search and by date-added (created_at) range, with server-side
 * pagination. Kept separate from getProducts() above (which returns the
 * full unpaginated list and is used by Purchases/Reports/the Purchase
 * Entry dropdown) so those callers aren't affected by this addition.
 */
export async function getProductsPaginated({ search = '', start, end, page = 1, pageSize = 10 } = {}) {
  let query = supabase.from('products').select('*', { count: 'exact' });

  if (search.trim()) {
    query = query.or(`product_name.ilike.%${search}%,barcode.ilike.%${search}%`);
  }
  if (start) query = query.gte('created_at', start);
  if (end) query = query.lte('created_at', `${end}T23:59:59`);

  query = query.order('created_at', { ascending: false });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

/**
 * All batches (Purchase Entries) for one product, oldest first — matching
 * FIFO consumption order — for the Stock page's expandable batch view.
 */
export async function getProductBatches(productId) {
  const { data, error } = await supabase
    .from('purchase_entries')
    .select('id, date, purchase_price, qty, remaining_qty, supplier, bill_number')
    .eq('product_id', productId)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getProductById(id) {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

/**
 * Checks whether an active product with this name (case-insensitive, trimmed)
 * already exists, excluding the given id (used when editing so a product
 * doesn't collide with itself). Used to warn BEFORE hitting the database's
 * unique constraint, with a friendlier message than a raw Postgres error.
 */
export async function findProductByExactName(name, excludeId) {
  let query = supabase
    .from('products')
    .select('id, product_name, current_stock, purchase_price, selling_price')
    .ilike('product_name', name.trim());

  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Uploads a product image and returns its public URL.
 * File path is namespaced by a random prefix to avoid collisions on same filename.
 */
export async function uploadProductImage(file) {
  const ext = file.name.split('.').pop();
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function createProduct(product) {
  const { data, error } = await supabase.from('products').insert(product).select().single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id, updates) {
  const { data, error } = await supabase.from('products').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}
