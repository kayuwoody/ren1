#!/usr/bin/env node
/**
 * Verify a Supabase project migration by comparing per-table row counts
 * between the OLD and NEW projects.
 *
 * - Auto-discovers every table/view from the OLD project's PostgREST OpenAPI
 *   spec, so it covers ALL tables (POS + bubu1's) without a hardcoded list.
 * - Counts via the service_role key, which bypasses RLS, so counts are exact
 *   and complete even with RLS enabled.
 * - No DB password and no `npm install` — uses the built-in fetch (Node 18+).
 *
 * Usage (PowerShell):
 *   $env:OLD_URL="https://OLD-REF.supabase.co"; $env:OLD_KEY="<old service_role key>"
 *   $env:NEW_URL="https://NEW-REF.supabase.co"; $env:NEW_KEY="<new service_role key>"
 *   node scripts/verify-migration.mjs
 *
 * Usage (bash):
 *   OLD_URL=... OLD_KEY=... NEW_URL=... NEW_KEY=... node scripts/verify-migration.mjs
 *
 * Exit code: 0 if every table matches, 1 if any mismatch/error, 2 if misconfigured.
 *
 * NOTE: KEYs must be the SERVICE_ROLE keys (Settings → API), not the anon keys —
 * the anon key + RLS would under-count. Run this on a machine you control.
 */

const { OLD_URL, OLD_KEY, NEW_URL, NEW_KEY } = process.env;

if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error('Missing env. Set OLD_URL, OLD_KEY, NEW_URL, NEW_KEY (KEYs = service_role).');
  process.exit(2);
}

const authHeaders = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

async function discoverTables(url, key) {
  const res = await fetch(`${url}/rest/v1/`, { headers: authHeaders(key) });
  if (!res.ok) throw new Error(`OpenAPI introspection failed: ${res.status} ${res.statusText}`);
  const spec = await res.json();
  return Object.keys(spec.paths || {})
    // single path segment = a table/view; excludes "/" and "/rpc/<fn>"
    .filter((p) => /^\/[A-Za-z0-9_]+$/.test(p))
    .map((p) => p.slice(1))
    .sort();
}

async function countRows(url, key, table) {
  try {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      method: 'HEAD',
      headers: { ...authHeaders(key), Prefer: 'count=exact' },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const cr = res.headers.get('content-range') || '';
    const total = parseInt(cr.split('/')[1], 10);
    if (Number.isNaN(total)) return { error: `bad content-range "${cr}"` };
    return { count: total };
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  console.log('Discovering tables from OLD project…');
  const tables = await discoverTables(OLD_URL, OLD_KEY);
  console.log(`Found ${tables.length} tables/views.\n`);

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('TABLE', 34)} ${pad('OLD', 10)} ${pad('NEW', 10)} STATUS`);
  console.log('-'.repeat(70));

  let problems = 0;
  for (const t of tables) {
    const [o, n] = await Promise.all([
      countRows(OLD_URL, OLD_KEY, t),
      countRows(NEW_URL, NEW_KEY, t),
    ]);
    const oldStr = o.error ? `ERR` : String(o.count);
    const newStr = n.error ? `ERR` : String(n.count);
    let status;
    if (o.error || n.error) {
      status = `ERROR ${o.error ? `old:${o.error} ` : ''}${n.error ? `new:${n.error}` : ''}`.trim();
      problems++;
    } else if (o.count === n.count) {
      status = 'ok';
    } else {
      status = `DIFF (${n.count - o.count})`;
      problems++;
    }
    console.log(`${pad(t, 34)} ${pad(oldStr, 10)} ${pad(newStr, 10)} ${status}`);
  }

  console.log('-'.repeat(70));
  if (problems === 0) {
    console.log(`All ${tables.length} tables match. Migration verified.`);
    process.exit(0);
  } else {
    console.log(`${problems} table(s) mismatched or errored — investigate before decommissioning the old project.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
