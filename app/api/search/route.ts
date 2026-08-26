import { getCustomStore } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

interface Hit {
  baseId: string;
  baseName: string;
  rowId?: string;
  label: string;
  kind: 'base' | 'row';
}

// Global search across the caller's OWN custom bases — matches base names and any
// string cell of their rows. Access-scoped via listBases(me); the built-in
// catalog has its own browse, so it's not swept here. Capped, so a big account
// can't turn a keystroke into a full-tree scan.
export async function GET(request: Request): Promise<Response> {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase();
  if (q.length < 2) return Response.json({ results: [] });

  const me = await currentEmail();
  const store = getCustomStore();
  let bases;
  try {
    bases = await store.listBases(me);
  } catch {
    return Response.json({ results: [] });
  }

  const MAX = 40;
  const PER_BASE = 8;
  const results: Hit[] = [];

  for (const b of bases) {
    if (results.length >= MAX) break;
    if (b.name.toLowerCase().includes(q)) {
      results.push({ baseId: b.id, baseName: b.name, label: b.name, kind: 'base' });
    }
    let recs;
    try {
      recs = await store.listRecords(b.id);
    } catch {
      continue;
    }
    const firstKey = b.columns[0]?.key;
    let per = 0;
    for (const r of recs) {
      if (per >= PER_BASE || results.length >= MAX) break;
      const hit = Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(q));
      if (!hit) continue;
      results.push({
        baseId: b.id,
        baseName: b.name,
        rowId: String(r.id),
        label: String((firstKey && r[firstKey]) ?? r.name ?? r.id),
        kind: 'row',
      });
      per++;
    }
  }

  return Response.json({ results: results.slice(0, MAX) });
}
