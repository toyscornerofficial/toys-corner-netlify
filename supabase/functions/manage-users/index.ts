// supabase/functions/manage-users/index.ts
//
// Admin-only user management: create, update, delete, and enable/disable
// accounts. This has to be an Edge Function (not a direct client call)
// because creating/deleting Supabase Auth users requires the service
// role key, which must never be shipped to the browser.
//
// Every request is checked twice before doing anything:
//   1. Is the caller a valid, logged-in user at all? (their JWT)
//   2. Does that user's profile have role = 'Admin'?
// Anyone else gets a 403, regardless of what they ask for.
//
// Secrets required (already available to every Edge Function automatically):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Admin client — bypasses RLS, used only after the caller is verified as Admin below.
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ---------- Verify the caller is a logged-in Admin ----------
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401);
    }

    const { data: callerData, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !callerData?.user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }

    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerData.user.id)
      .single();

    if (profileError || callerProfile?.role !== 'Admin') {
      return jsonResponse({ error: 'Only an Admin can manage users' }, 403);
    }

    // ---------- Handle the requested action ----------
    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
      const { name, email, password, role } = body;
      if (!name || !email || !password || !role) {
        return jsonResponse({ error: 'name, email, password, and role are all required' }, 400);
      }
      if (!['Admin', 'Staff'].includes(role)) {
        return jsonResponse({ error: 'role must be Admin or Staff' }, 400);
      }

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // no email verification step needed for an internally-managed 2-person shop system
      });
      if (createError) throw createError;

      const { error: insertError } = await adminClient
        .from('profiles')
        .insert({ id: created.user.id, name, email, role });

      if (insertError) {
        // Roll back the auth user so we don't leave an orphaned account
        // with no profile if the profile insert failed for any reason.
        await adminClient.auth.admin.deleteUser(created.user.id);
        throw insertError;
      }

      return jsonResponse({ success: true, userId: created.user.id });
    }

    if (action === 'update') {
      const { userId, name, role, email, password } = body;
      if (!userId) return jsonResponse({ error: 'userId is required' }, 400);

      if (userId === callerData.user.id && role && role !== callerProfile.role) {
        return jsonResponse({ error: "You can't change your own role — ask another Admin to do this." }, 400);
      }

      const profileUpdates: Record<string, unknown> = {};
      if (name) profileUpdates.name = name;
      if (role) profileUpdates.role = role;
      if (email) profileUpdates.email = email;

      if (Object.keys(profileUpdates).length > 0) {
        const { error } = await adminClient.from('profiles').update(profileUpdates).eq('id', userId);
        if (error) throw error;
      }

      // Auth-side updates (email/password) are separate from the profile row
      const authUpdates: Record<string, unknown> = {};
      if (email) authUpdates.email = email;
      if (password) authUpdates.password = password;

      if (Object.keys(authUpdates).length > 0) {
        const { error } = await adminClient.auth.admin.updateUserById(userId, authUpdates);
        if (error) throw error;
      }

      return jsonResponse({ success: true });
    }

    if (action === 'toggle_active') {
      const { userId, isActive } = body;
      if (!userId || typeof isActive !== 'boolean') {
        return jsonResponse({ error: 'userId and isActive are required' }, 400);
      }
      if (userId === callerData.user.id && !isActive) {
        return jsonResponse({ error: "You can't disable your own account." }, 400);
      }

      const { error } = await adminClient.from('profiles').update({ is_active: isActive }).eq('id', userId);
      if (error) throw error;

      return jsonResponse({ success: true });
    }

    if (action === 'delete') {
      const { userId } = body;
      if (!userId) return jsonResponse({ error: 'userId is required' }, 400);
      if (userId === callerData.user.id) {
        return jsonResponse({ error: "You can't delete your own account." }, 400);
      }

      // Deletes the auth user; profiles row cascades via its own FK to auth.users.
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('manage-users error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      500
    );
  }
});
