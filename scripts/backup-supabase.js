#!/usr/bin/env node

/**
 * Supabase Backup Script
 *
 * Exports loyalty, voucher, and online order data from Supabase to JSON files.
 * Uses the Supabase REST API (no pg_dump/psql needed on Windows).
 *
 * Usage:
 *   node scripts/backup-supabase.js
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Output: backups/supabase-YYYY-MM-DD-HHmmss/
 */

const fs = require('fs');
const path = require('path');

// Load env file (.env.local or .env)
const projectRoot = path.join(__dirname, '..');
const envLocal = path.join(projectRoot, '.env.local');
const envDefault = path.join(projectRoot, '.env');
const envPath = fs.existsSync(envLocal) ? envLocal : fs.existsSync(envDefault) ? envDefault : null;

if (envPath) {
  console.log(`Loading env from: ${envPath}`);
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) process.env[key] = value;
    }
  });
} else {
  console.error(`No .env.local or .env found in: ${projectRoot}`);
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const TABLES = [
  'loyalty_programs',
  'loyalty_members',
  'loyalty_member_programs',
  'loyalty_transactions',
  'vouchers',
  'online_orders',
  'online_order_items',
  'outlet_settings',
];

async function fetchTable(table) {
  const pageSize = 1000;
  let allRows = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&order=created_at.desc.nullslast&offset=${offset}&limit=${pageSize}`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'count=exact',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch ${table}: ${res.status} ${text}`);
    }

    const rows = await res.json();
    allRows = allRows.concat(rows);
    hasMore = rows.length === pageSize;
    offset += pageSize;
  }

  return allRows;
}

async function main() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(__dirname, '..', 'backups', `supabase-${timestamp}`);

  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`\nSupabase Backup — ${now.toLocaleString()}`);
  console.log(`Output: ${backupDir}\n`);

  let totalRows = 0;
  const summary = {};

  for (const table of TABLES) {
    process.stdout.write(`  ${table}... `);
    try {
      const rows = await fetchTable(table);
      const filePath = path.join(backupDir, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
      console.log(`${rows.length} rows`);
      summary[table] = rows.length;
      totalRows += rows.length;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      summary[table] = 'FAILED';
    }
  }

  // Write summary
  const summaryData = {
    timestamp: now.toISOString(),
    supabase_url: SUPABASE_URL.replace(/https?:\/\//, '').split('.')[0] + '.supabase.co',
    tables: summary,
    total_rows: totalRows,
  };
  fs.writeFileSync(path.join(backupDir, '_summary.json'), JSON.stringify(summaryData, null, 2));

  console.log(`\nDone — ${totalRows} total rows backed up to ${backupDir}\n`);
}

main().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
