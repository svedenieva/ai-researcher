// Verify Row-Level Security before a deploy — the repeatable version of the
// manual anon-vs-service check (see migrations/RLS.md).
//
// For every user table it proves the public anon key can neither READ nor WRITE
// the table directly through PostgREST, while the service key (the app) can:
//   - read:  anon SELECT must return 0 rows; service shows the real count.
//   - write: anon INSERT of a minimal valid row must be denied with 42501
//            ("violates row-level security policy"). This is the decisive signal
//            and works even when the table is EMPTY (where the read test alone
//            can't tell "RLS blocks" from "no data").
// A denied insert writes nothing; on the off chance RLS is OFF and the insert
// succeeds, the row is deleted again via the service key.
//
// Run: node --env-file=.env.local scripts/check-rls.mjs
// Exit code 0 = all closed; 1 = a hole (or missing env / inconclusive).

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !SERVICE || !ANON) {
  console.error('Missing env. Need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  console.error('Run with: node --env-file=.env.local scripts/check-rls.mjs');
  process.exit(1);
}

// Minimal rows that satisfy each table's NOT-NULL columns, so PostgREST reaches
// the RLS check instead of stopping at a schema error. Values are throwaway.
const TABLES = [
  { name: 'bases', probe: { id: '__rls_probe__', name: 'rls probe', tone: 'rls probe' } },
  { name: 'base_records', probe: { base_id: '__rls_probe__', data: {} } },
  { name: 'sites', probe: { id: '__rls_probe__', name: 'rls probe' } },
  { name: 'trusted_sources', probe: { name: '__rls_probe__' } },
];

const headers = (key, extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, ...extra });

// PostgREST returns the total in the Content-Range header: "0-0/155" or "*/0".
async function rowCount(key, table) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=*`, {
    headers: headers(key, { Prefer: 'count=exact', Range: '0-0' }),
  });
  const cr = res.headers.get('content-range') || '';
  const total = cr.includes('/') ? cr.split('/')[1] : null;
  return { status: res.status, total: total === null ? null : Number(total) };
}

async function anonInsert(table, probe) {
  const res = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(ANON, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(probe),
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, code: body?.code ?? '', row: Array.isArray(body) ? body[0] : null };
}

async function serviceDeleteById(table, id) {
  if (!id) return;
  await fetch(`${URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(SERVICE),
  });
}

const PASS = 'PASS', FAIL = 'FAIL', WARN = 'WARN';

async function checkTable({ name, probe }) {
  const anonRead = await rowCount(ANON, name);
  const svcRead = await rowCount(SERVICE, name);
  const ins = await anonInsert(name, probe);

  const anonCanRead = typeof anonRead.total === 'number' && anonRead.total > 0;
  const insertSucceeded = ins.status >= 200 && ins.status < 300;
  const insertDenied = ins.status === 401 || ins.status === 403 || ins.code === '42501';

  let verdict, note;
  if (anonCanRead) {
    verdict = FAIL; note = `anon READ returned ${anonRead.total} rows`;
  } else if (insertSucceeded) {
    verdict = FAIL; note = `anon WRITE succeeded (RLS off)`;
    await serviceDeleteById(name, ins.row?.id ?? probe.id); // clean up the leak
  } else if (insertDenied) {
    verdict = PASS; note = ins.code === '42501' ? 'read [] · write 42501' : `read [] · write ${ins.status}`;
  } else if (typeof svcRead.total === 'number' && svcRead.total > 0) {
    // insert neither succeeded nor gave a clean RLS denial (schema drift?), but
    // service has data and anon reads none — read-proof still holds
    verdict = WARN; note = `read-proof only; insert inconclusive (status ${ins.status}, code ${ins.code || '—'})`;
  } else {
    verdict = WARN; note = `inconclusive: empty table and insert not RLS-denied (status ${ins.status}, code ${ins.code || '—'})`;
  }

  return { name, verdict, note, anon: anonRead.total, service: svcRead.total };
}

const host = URL.replace(/^https?:\/\//, '').split('.')[0];
console.log(`RLS check → project ${host}…  (anon must not read/write; service can)\n`);

const results = [];
for (const t of TABLES) results.push(await checkTable(t));

const icon = (v) => (v === PASS ? '✅' : v === FAIL ? '⛔' : '⚠️ ');
const pad = (s, n) => String(s ?? '').padEnd(n);
console.log(pad('Table', 18) + pad('Verdict', 10) + pad('anon', 6) + pad('service', 8) + 'note');
console.log('-'.repeat(78));
for (const r of results) {
  console.log(
    pad(r.name, 18) + pad(`${icon(r.verdict)}${r.verdict}`, 10) +
    pad(r.anon ?? '?', 6) + pad(r.service ?? '?', 8) + r.note,
  );
}

const failed = results.filter((r) => r.verdict === FAIL);
const warned = results.filter((r) => r.verdict === WARN);
console.log('');
if (failed.length) {
  console.error(`⛔ ${failed.length} table(s) NOT protected: ${failed.map((r) => r.name).join(', ')}`);
  process.exit(1);
}
if (warned.length) {
  console.error(`⚠️  ${warned.length} inconclusive: ${warned.map((r) => r.name).join(', ')} — check manually.`);
  process.exit(1);
}
console.log(`✅ All ${results.length} tables: anon blocked on read and write. RLS holds.`);
process.exit(0);
