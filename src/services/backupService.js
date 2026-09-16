import { supabase } from './supabaseClient';
import { formatDateIST } from '../utils/dateHelpers';

// Tables included in a backup EXPORT — a full snapshot, since exporting has
// no side effects on the live data.
const EXPORT_TABLES = ['products', 'customers', 'sales', 'sale_items', 'purchase_entries', 'expenses', 'inquiries', 'settings'];

// Tables safe to RESTORE without side effects. Sales, sale_items, and
// purchase_entries are deliberately EXCLUDED from restore: those tables
// have database triggers that adjust products.current_stock on every
// INSERT (see 0002_stock_triggers.sql). Restoring them through the normal
// client would re-fire those triggers and silently double-count stock
// changes that already happened once. There's no safe way to disable
// triggers from the client (that needs superuser/service-role access this
// app doesn't have), so those three tables are excluded here rather than
// risk quietly corrupting stock numbers.
const RESTORE_SAFE_TABLES = ['products', 'customers', 'expenses', 'inquiries', 'settings'];

export async function exportBackup() {
  const backup = { exportedAt: new Date().toISOString(), tables: {} };

  for (const table of EXPORT_TABLES) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    backup.tables[table] = data ?? [];
  }

  const filename = `Backup_ToysCorner_${formatDateIST(new Date(), 'DDMMMYYYY_HHmm')}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  return { filename, tableCounts: Object.fromEntries(EXPORT_TABLES.map((t) => [t, backup.tables[t].length])) };
}

/**
 * Restores only the tables listed in RESTORE_SAFE_TABLES, via upsert on `id`
 * so re-running a restore is idempotent. Returns per-table counts and the
 * list of tables present in the file but skipped (so the UI can tell the
 * person exactly what was and wasn't restored, and why).
 */
export async function restoreBackup(backupJson) {
  const results = {};
  const skipped = [];

  for (const table of Object.keys(backupJson.tables ?? {})) {
    if (!RESTORE_SAFE_TABLES.includes(table)) {
      skipped.push(table);
      continue;
    }

    const rows = backupJson.tables[table];
    if (!rows || rows.length === 0) {
      results[table] = 0;
      continue;
    }

    if (table === 'settings') {
      // Single-row table — update rather than upsert-by-array
      const { error } = await supabase.from('settings').update(rows[0]).eq('id', 1);
      if (error) throw error;
      results[table] = 1;
    } else {
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      results[table] = rows.length;
    }
  }

  return { restored: results, skipped };
}

export { RESTORE_SAFE_TABLES };
