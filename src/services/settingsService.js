import { supabase } from './supabaseClient';

const LOGO_BUCKET = 'product-images'; // reusing the existing public bucket from Phase 5

export async function getSettings() {
  const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
}

export async function updateSettings(updates) {
  const { data, error } = await supabase
    .from('settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function uploadLogo(file) {
  const ext = file.name.split('.').pop();
  const path = `shop-logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Manually triggers the daily-report Edge Function for a specific date
 * (defaults to today), bypassing the daily_report_enabled toggle via
 * force:true — used by the "Send Report Now" button, e.g. when the
 * scheduled cron run didn't fire for some reason.
 */
export async function sendDailyReportNow(date) {
  const { data, error } = await supabase.functions.invoke('daily-report', {
    body: { date, force: true },
  });
  if (error) throw error;
  return data;
}
