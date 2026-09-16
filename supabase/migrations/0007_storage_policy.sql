-- ============================================================
-- 0007_storage_policy.sql
-- Allows any authenticated user to upload/read/delete product images.
-- Run this AFTER manually creating the 'product-images' bucket
-- (Supabase Dashboard -> Storage -> New bucket -> Public: ON).
-- ============================================================

create policy "product_images_read"
on storage.objects for select
using (bucket_id = 'product-images');

create policy "product_images_insert"
on storage.objects for insert
with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

create policy "product_images_update"
on storage.objects for update
using (bucket_id = 'product-images' and auth.role() = 'authenticated');

create policy "product_images_delete"
on storage.objects for delete
using (bucket_id = 'product-images' and auth.role() = 'authenticated');
