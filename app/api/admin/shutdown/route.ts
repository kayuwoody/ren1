import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

export const dynamic = 'force-dynamic';

const BACKUP_TABLES = [
  'loyalty_programs',
  'loyalty_members',
  'loyalty_member_programs',
  'loyalty_transactions',
  'vouchers',
  'online_orders',
  'online_order_items',
  'outlet_settings',
  'pos_orders',
  'pos_order_items',
];

async function fetchTable(table: string) {
  const pageSize = 1000;
  let allRows: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(offset, offset + pageSize - 1)
      .order('created_at', { ascending: false, nullsFirst: false });

    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    allRows = allRows.concat(data || []);
    hasMore = (data?.length || 0) === pageSize;
    offset += pageSize;
  }

  return allRows;
}

export async function POST() {
  const steps: { step: string; status: 'ok' | 'failed' | 'skipped'; detail?: string }[] = [];

  // Step 1: Backup SQLite database
  try {
    const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
    if (fs.existsSync(dbPath)) {
      const backupDir = path.join(process.cwd(), 'backups');
      fs.mkdirSync(backupDir, { recursive: true });

      const now = new Date();
      const klTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const stamp = klTime.toISOString().slice(0, 10);
      const backupPath = path.join(backupDir, `dev-${stamp}.db`);

      fs.copyFileSync(dbPath, backupPath);
      steps.push({ step: 'SQLite backup', status: 'ok', detail: `dev-${stamp}.db` });
    } else {
      steps.push({ step: 'SQLite backup', status: 'skipped', detail: 'dev.db not found' });
    }
  } catch (err: any) {
    steps.push({ step: 'SQLite backup', status: 'failed', detail: err.message });
  }

  // Step 2: Backup Supabase tables
  try {
    const now = new Date();
    const klTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const timestamp = klTime.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(process.cwd(), 'backups', `supabase-${timestamp}`);
    fs.mkdirSync(backupDir, { recursive: true });

    let totalRows = 0;
    const summary: Record<string, number | string> = {};

    for (const table of BACKUP_TABLES) {
      try {
        const rows = await fetchTable(table);
        fs.writeFileSync(path.join(backupDir, `${table}.json`), JSON.stringify(rows, null, 2));
        summary[table] = rows.length;
        totalRows += rows.length;
      } catch (err: any) {
        summary[table] = `FAILED: ${err.message}`;
      }
    }

    fs.writeFileSync(path.join(backupDir, '_summary.json'), JSON.stringify({
      timestamp: now.toISOString(),
      tables: summary,
      total_rows: totalRows,
    }, null, 2));

    steps.push({ step: 'Supabase backup', status: 'ok', detail: `${totalRows} rows across ${BACKUP_TABLES.length} tables` });
  } catch (err: any) {
    steps.push({ step: 'Supabase backup', status: 'failed', detail: err.message });
  }

  // Step 3: Pause online order intake
  // Upsert so it works even if no settings row exists yet, and tolerate a
  // missing intake_force_open column (older schemas) by falling back to
  // writing just intake_paused.
  try {
    const full = await supabase
      .from('outlet_settings')
      .upsert(
        { outlet_id: 'main', intake_paused: true, intake_force_open: false },
        { onConflict: 'outlet_id' },
      );

    if (full.error) {
      const fallback = await supabase
        .from('outlet_settings')
        .upsert(
          { outlet_id: 'main', intake_paused: true },
          { onConflict: 'outlet_id' },
        );
      if (fallback.error) throw fallback.error;
    }
    steps.push({ step: 'Pause online orders', status: 'ok' });
  } catch (err: any) {
    steps.push({ step: 'Pause online orders', status: 'failed', detail: err.message });
  }

  // Step 4: Schedule PC shutdown (Windows: 60 second delay so response can be sent)
  try {
    if (process.platform === 'win32') {
      exec('shutdown /s /t 60 /c "Coffee Oasis POS - End of day shutdown"');
      steps.push({ step: 'PC shutdown', status: 'ok', detail: 'Shutting down in 60 seconds' });
    } else {
      steps.push({ step: 'PC shutdown', status: 'skipped', detail: `Not Windows (${process.platform})` });
    }
  } catch (err: any) {
    steps.push({ step: 'PC shutdown', status: 'failed', detail: err.message });
  }

  return NextResponse.json({ success: true, steps });
}
