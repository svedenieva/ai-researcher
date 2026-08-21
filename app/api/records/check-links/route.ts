import { currentEmail } from '@/lib/current-user';
import { canAccessBase, getCustomStore } from '@/lib/datasource/customStore';
import { BASES } from '@/lib/datasource/bases';
import { CHECK_COLUMN, checkAll, extractUrls, summarize } from '@/lib/research/links';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

// Ceiling on one run: research bases are small, and an unbounded fan-out of
// outbound requests is exactly the kind of thing that should not be reachable
// from a button.
const MAX_URLS = 120;

// Walk a base's rows, fetch every source they cite, and write the verdict back
// into a "Проверка" column. It answers "does this source exist", never "is this
// row true" — the second question stays with the human who sets "Проверено".
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

    if (!base.columns.some((c) => c.key === CHECK_COLUMN.key)) {
      await store.addColumn(baseId, { label: CHECK_COLUMN.label, type: 'text' });
    }

    let dead = 0;
    let checked = 0;
    for (const [rowId, urls] of urlsByRow) {
      const checks = urls.map((u) => results.get(u)).filter((c) => c !== undefined);
      checked += checks.length;
      dead += checks.filter((c) => c.verdict !== 'ok').length;
      await store.updateRecord(baseId, rowId, { [CHECK_COLUMN.key]: summarize(checks) });
    }

    return Response.json({
      rows: rows.length,
      urls: checked,
      dead,
      // say plainly when the cap hid something, instead of implying full coverage
      skipped: unique.length - capped.length,
    });
  } catch (e) {
    console.error('link check failed:', e);
    return Response.json({ error: 'Could not check the links' }, { status: 500 });
  }
}
