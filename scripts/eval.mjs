// Baseline the research on the measure set — one command (roadmap step 1–2).
// Lists your research run bases and scores each on the metrics that make a
// research answer trustworthy, so "it got better" has numbers behind it.
//
// The offline metrics mirror lib/research/eval.ts (link rate, quote rate,
// duplicates, empties). With --verify it also fetches each cited page and checks
// the quote is really there (the honest, network metric) — capped.
//
// Run:  node --env-file=.env.local scripts/eval.mjs [baseId] [--verify]
//   no baseId → every run base, scored.  baseId → just that one.

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !SERVICE) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY (use --env-file=.env.local)');
  process.exit(1);
}

const args = process.argv.slice(2);
const verify = args.includes('--verify');
const onlyBase = args.find((a) => !a.startsWith('--'));
const RUN_PREFIX = 'Исследование:';

const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const rest = async (path) => {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`REST ${res.status} on ${path}`);
  return res.json();
};

// ── scoring (mirror of lib/research/eval.ts) ────────────────────────────────
const URL_RE = /https?:\/\/[^\s"'<>)]+/i;
const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
function extractRow(r) {
  const pick = (...keys) => { for (const k of keys) { const t = text(r[k]); if (t) return t; } return ''; };
  const linkField = pick('источники', 'источник', 'sources', 'source', 'url', 'ссылка', 'посилання');
  return {
    name: pick('название', 'назва', 'name', 'title'),
    quote: pick('цитата', 'quote'),
    link: URL_RE.exec(linkField)?.[0] ?? '',
  };
}
function scoreRows(rows) {
  const total = rows.length;
  const withLink = rows.filter((r) => r.link).length;
  const withQuote = rows.filter((r) => r.quote.replace(/\s+/g, ' ').trim().length >= 12).length;
  const empty = rows.filter((r) => !r.name && !r.quote && !r.link).length;
  const seen = new Set();
  let dup = 0;
  for (const r of rows) {
    const k = r.name.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) dup++; else seen.add(k);
  }
  return {
    total,
    linkRate: total ? withLink / total : 0,
    quoteRate: total ? withQuote / total : 0,
    dup,
    empty,
  };
}

// ── quote-on-page (only with --verify) ──────────────────────────────────────
const norm = (s) => s.replace(/\s+/g, ' ').replace(/[«»"“”'’‘`]/g, '"').trim().toLowerCase();
const stripHtml = (h) => h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
async function quoteFoundOnPage(url, quote) {
  const needle = norm(quote);
  if (!url || needle.length < 12) return false;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return false;
    const hay = norm(stripHtml(await res.text()));
    return hay.includes(needle) || hay.includes(needle.slice(0, 120));
  } catch { return false; }
}

async function scoreBase(base) {
  const recs = await rest(`base_records?base_id=eq.${encodeURIComponent(base.id)}&select=data`);
  const rows = recs.map((r) => extractRow(r.data ?? {}));
  const s = scoreRows(rows);
  let verifyStr = '';
  if (verify) {
    const CAP = 30;
    const targets = rows.filter((r) => r.link && r.quote.replace(/\s+/g, ' ').trim().length >= 12).slice(0, CAP);
    let found = 0;
    for (const r of targets) if (await quoteFoundOnPage(r.link, r.quote)) found++;
    verifyStr = targets.length ? `  quote-on-page ${Math.round((found / targets.length) * 100)}% (${found}/${targets.length})` : '  quote-on-page —';
  }
  return { name: base.name, ...s, verifyStr };
}

// ── run ─────────────────────────────────────────────────────────────────────
const pct = (n) => `${Math.round(n * 100)}%`;
const bases = await rest('bases?select=id,name');
let runs = bases.filter((b) => String(b.name).startsWith(RUN_PREFIX));
if (onlyBase) runs = bases.filter((b) => b.id === onlyBase);

if (!runs.length) {
  console.log(onlyBase ? `No base ${onlyBase}.` : 'No research run bases found (names starting with "Исследование:"). Pass a base id to score any base.');
} else {
  console.log(`Scoring ${runs.length} run base(s)${verify ? ' with page verification' : ''}:\n`);
  console.log('rows  link  quote  dup  empty  base');
  console.log('-'.repeat(70));
  const agg = { linkRate: 0, quoteRate: 0, n: 0 };
  for (const base of runs) {
    const r = await scoreBase(base);
    const name = r.name.replace(RUN_PREFIX, '').trim().slice(0, 40);
    console.log(
      `${String(r.total).padEnd(5)} ${pct(r.linkRate).padEnd(5)} ${pct(r.quoteRate).padEnd(6)} ${String(r.dup).padEnd(4)} ${String(r.empty).padEnd(6)} ${name}${r.verifyStr}`,
    );
    if (r.total) { agg.linkRate += r.linkRate; agg.quoteRate += r.quoteRate; agg.n++; }
  }
  if (agg.n) {
    console.log('-'.repeat(70));
    console.log(`Average across ${agg.n}: link ${pct(agg.linkRate / agg.n)} · quote ${pct(agg.quoteRate / agg.n)}`);
  }
}
