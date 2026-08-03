import { getDataSource } from '@/lib/datasource';
import { JsonDataSource } from '@/lib/datasource/json';
import { BASES, baseById } from '@/lib/datasource/bases';
import { getCustomStore } from '@/lib/datasource/customStore';
import type { ListParams } from '@/lib/datasource/types';

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

function readParams(url: URL): { params: ListParams; q: string | null } {
  const params: ListParams = {};
  const sortKey = url.searchParams.get('sortKey');
  const sortDir = url.searchParams.get('sortDir');
  if (sortKey) params.sort = { key: sortKey, dir: sortDir === 'desc' ? 'desc' : 'asc' };

  const filters: Record<string, string> = {};
  for (const raw of url.searchParams.getAll('f')) {
    const i = raw.indexOf(':');
    if (i > 0) filters[raw.slice(0, i)] = raw.slice(i + 1);
  }
  if (Object.keys(filters).length) params.filters = filters;

  const q = url.searchParams.get('q');
  if (q) params.search = q;
  return { params, q };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const baseId = url.searchParams.get('base');
  const { params, q } = readParams(url);

  // ── пользовательская база (создана из UI) ─────────────────────
  if (baseId && !BUILTIN_IDS.has(baseId)) {
    try {
      const store = getCustomStore();
      const custom = await store.getBase(baseId);
      if (custom) {
        const rows = await store.listRecords(baseId);
        const ds = new JsonDataSource(rows, custom.columns);
        const [records, facets] = await Promise.all([ds.list(params), ds.facets()]);
        const total = q || params.filters ? (await ds.list()).length : records.length;
        return Response.json({ columns: custom.columns, records, facets, total, base: baseId, custom: true });
      }
    } catch (e) {
      console.error('custom base read failed:', e);
    }
    // не нашли/ошибка — падаем на витрину по умолчанию
  }

  // ── встроенная база (срез каталога продуктов) ─────────────────
  const base = baseById(baseId);
  if (base.section) params.filters = { ...(params.filters ?? {}), section: base.section };

  const ds = getDataSource();
  const [allColumns, records, allFacets] = await Promise.all([
    ds.columns(),
    ds.list(params),
    ds.facets(),
  ]);

  let columns = allColumns;
  let facets = allFacets;
  if (base.section) {
    columns = allColumns.filter((c) => c.key !== 'section');
    const { section: _section, ...rest } = allFacets;
    facets = rest;
  }

  const baseParams: ListParams | undefined = base.section ? { filters: { section: base.section } } : undefined;
  const userNarrowed = Boolean(
    params.filter || q || (params.filters && Object.keys(params.filters).some((k) => k !== 'section')),
  );
  const total = userNarrowed ? (await ds.list(baseParams)).length : records.length;

  return Response.json({ columns, records, facets, total, base: base.id, custom: false });
}

// добавить строку в пользовательскую базу
export async function POST(request: Request): Promise<Response> {
  let body: { base?: unknown; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Некорректный запрос' }, { status: 400 });
  }
  const baseId = String(body?.base ?? '');
  if (!baseId || BUILTIN_IDS.has(baseId)) {
    return Response.json({ error: 'В эту базу нельзя добавлять строки' }, { status: 400 });
  }
  const data = body?.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : {};

  try {
    const store = getCustomStore();
    const base = await store.getBase(baseId);
    if (!base) return Response.json({ error: 'База не найдена' }, { status: 404 });
    const record = await store.addRecord(baseId, data);
    return Response.json({ record });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка добавления строки';
    return Response.json({ error: msg }, { status: 500 });
  }
}
