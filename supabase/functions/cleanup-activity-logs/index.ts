// supabase/functions/cleanup-activity-logs/index.ts
//
// Deletes activity_logs rows older than 7 days. Run on its own daily
// schedule (separate cron trigger from daily-report — see README).
//
// Secrets required (same as daily-report):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const RETENTION_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error, count } = await supabase
      .from('activity_logs')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff)
      .select('id');

    if (error) throw error;

    console.log(`Deleted ${count ?? data?.length ?? 0} activity_logs rows older than ${cutoff}`);

    return jsonResponse({
      deleted: count ?? data?.length ?? 0,
      cutoff,
    });
  } catch (error) {
    console.error('cleanup-activity-logs error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      500
    );
  }
});
