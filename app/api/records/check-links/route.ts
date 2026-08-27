import { currentEmail } from '@/lib/current-user';
import { canAccessBase, getCustomStore } from '@/lib/datasource/customStore';
import { BASES } from '@/lib/datasource/bases';
import { CHECK_COLUMN, checkAll, extractUrls, isFetchableUrl, summarize } from '@/lib/research/links';
import { extractRow } from '@/lib/research/eval';
import { quoteFoundOnPage } from '@/lib/research/verify-quote';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

// Ceiling on one run: research bases are small, and an unbounded fan-out of
// outbound requests is exactly the kind of thing that should not be reachable
// from a button.
const MAX_URLS = 120;
// The quote check reads the FULL page body (heavier than a link HEAD), so it
// gets its own, lower cap and runs with a small concurrency limit.
const MAX_QUOTES = 60;
const QUOTE_CONCURRENCY = 6;

// Is the row's verbatim quote actually present on the page it cites? A link is
// cheap to invent; a quote that survives a search of the page is not. This turns
// the button from "does the source exist" into "does the source exist AND does
// it really say this" — the missing quote is what flags an invented row.
async function verifyQuotes(
  targets: Array<{ rowId: string; url: string; quote: string }>,
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  let i = 0;
  const worker = async () => {
    while (i < targets.length) {
      const t = targets[i++];
      out.set(t.rowId, await quoteFoundOnPage(t.url, t.quote));
    }
  };
  await Promise.all(Array.from({ length: Math.min(QUOTE_CONCURRENCY, targets.length) }, worker));
  return out;
}

// Walk a base's rows, fetch every source they cite, and write the verdict back
// into a "Проверка" column. It checks two mechanical things — that the source
// opens, and that the row's quote is actually on that page — never "is this row
// true": the truth call stays with the human who sets "Проверено".
export async function POST(request: Request): Promise<Response> {
  let body: { base?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed request' }, { status: 400 });
  }
  const baseId = String(body?.base ?? '');
  if (!baseId || BUILTIN_IDS.has(baseId)) {
    return Response.json({ error: 'Only your own bases can be checked' }, { status: 400 });
  }

  const store = getCustomStore();
  const me = await currentEmail();
  const base = await store.getBase(baseId);
  if (!base || !canAccessBase(base, me)) {
    return Response.json({ error: 'Base not found, or no access' }, { status: 404 });
  }

  try {
    const rows = await store.listRecords(baseId);
    const urlsByRow = new Map<string, string[]>();
    const all: string[] = [];
    for (const row of rows) {
      const urls = Object.entries(row)
        .filter(([key]) => key !== 'id' && key !== CHECK_COLUMN.key)
        .flatMap(([, value]) => extractUrls(value));
      urlsByRow.set(String(row.id), urls);
      all.push(...urls);
    }

    const unique = [...new Set(all)];
    const capped = unique.slice(0, MAX_URLS);
    const results = await checkAll(capped);

    // Quote pass: for each row, the verbatim quote and the single best link to
    // check it against. Only fetchable links (SSRF guard) and real quotes count.
    const quoteTargets: Array<{ rowId: string; url: string; quote: string }> = [];
    for (const row of rows) {
      const { quote, link } = extractRow(row);
      const q = quote.replace(/\s+/g, ' ').trim();
      if (q.length >= 12 && link && isFetchableUrl(link)) {
        quoteTargets.push({ rowId: String(row.id), url: link, quote: q });
      }
    }
    const cappedQuotes = quoteTargets.slice(0, MAX_QUOTES);
    const quoteFound = await verifyQuotes(cappedQuotes);

    if (!base.columns.some((c) => c.key === CHECK_COLUMN.key)) {
      await store.addColumn(baseId, { label: CHECK_COLUMN.label, type: 'text' });
    }

    let dead = 0;
    let checked = 0;
    let quotesChecked = 0;
    let quotesMissing = 0;
    for (const [rowId, urls] of urlsByRow) {
      const checks = urls.map((u) => results.get(u)).filter((c) => c !== undefined);
      checked += checks.length;
      dead += checks.filter((c) => c.verdict !== 'ok').length;

      // fold the quote verdict into the same cell, honestly separating "the
      // source is down, can't tell" from "the page just doesn't say this"
      let quoteNote = '';
      if (quoteFound.has(rowId)) {
        quotesChecked += 1;
        const found = quoteFound.get(rowId);
        const anyOk = checks.some((c) => c.verdict === 'ok');
        if (found) quoteNote = 'цитата найдена ✓';
        else if (checks.length && !anyOk) quoteNote = 'цитату не проверить (источник недоступен)';
        else { quoteNote = 'цитаты нет на странице ✗'; quotesMissing += 1; }
      }

      const verdict = quoteNote ? `${summarize(checks)} · ${quoteNote}` : summarize(checks);
      await store.updateRecord(baseId, rowId, { [CHECK_COLUMN.key]: verdict });
    }

    return Response.json({
      rows: rows.length,
      urls: checked,
      dead,
      quotesChecked,
      quotesMissing,
      // say plainly when a cap hid something, instead of implying full coverage
      skipped: unique.length - capped.length,
      quotesSkipped: quoteTargets.length - cappedQuotes.length,
    });
  } catch (e) {
    console.error('link check failed:', e);
    return Response.json({ error: 'Could not check the links' }, { status: 500 });
  }
}
