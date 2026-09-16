import { supabase } from './supabaseClient';

/** All user profiles — any authenticated user can read this (matches existing RLS). */
export async function getUsers() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Every write action (create/update/delete/toggle_active) goes through the
 * manage-users Edge Function — it's the only thing with the service role
 * key needed to touch Supabase Auth accounts, and it independently
 * verifies the caller is an Admin before doing anything.
 */
async function callManageUsers(payload) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not logged in.');

  const { data, error } = await supabase.functions.invoke('manage-users', {
    body: payload,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    // supabase-js's FunctionsHttpError doesn't surface the JSON body's
    // `error` message directly — pull it out so the UI shows something
    // useful ("Only an Admin can manage users") instead of a generic
    // "Edge Function returned a non-2xx status code".
    const context = error.context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        throw new Error(body?.error || error.message);
      } catch {
        throw error;
      }
    }
    throw error;
  }

  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createUser({ name, email, password, role }) {
  return callManageUsers({ action: 'create', name, email, password, role });
}

export async function updateUser({ userId, name, role, email, password }) {
  return callManageUsers({ action: 'update', userId, name, role, email, password });
}

export async function toggleUserActive(userId, isActive) {
  return callManageUsers({ action: 'toggle_active', userId, isActive });
}

export async function deleteUser(userId) {
  return callManageUsers({ action: 'delete', userId });
}
