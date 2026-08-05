import { getDataSource } from '@/lib/datasource';
import { JsonDataSource } from '@/lib/datasource/json';
import { BASES, baseById } from '@/lib/datasource/bases';
import { getCustomStore } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
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

  // Раздел показывает свои записи И всё, что лежит ниже по дереву —
  // выбор уровня работает как слайс: чем выше уровень, тем шире срез.
  const SOURCE_COL = {
    key: '__source',
    label: 'Из базы',
    type: 'select' as const,
    sortable: true,
    filterable: true,
  };

  // ── пользовательская база (создана из UI) ─────────────────────
  if (baseId && !BUILTIN_IDS.has(baseId)) {
    try {
      const store = getCustomStore();
      const custom = await store.getBase(baseId);
      const me = await currentEmail();
      // чужую базу не отдаём даже по прямой ссылке
      if (custom && custom.owner && custom.owner !== me) {
        return Response.json({ error: "Нет доступа к этой базе" }, { status: 403 });
      }
      if (custom) {
        const all = (await store.listBases()).filter((b) => !b.owner || b.owner === me);
        // все потомки выбранной базы (чужие ветки не подмешиваем)
        const kids = new Map<string, string[]>();
        for (const b of all) {
          if (!b.parent) continue;
          kids.set(b.parent, [...(kids.get(b.parent) ?? []), b.id]);
        }
        const descendants: string[] = [];
        const walk = (id: string) => {
          for (const child of kids.get(id) ?? []) {
            descendants.push(child);
            walk(child);
          }
        };
        walk(baseId);

        const nameById = new Map(all.map((b) => [b.id, b.name]));
        let rows = (await store.listRecords(baseId)).map((r) => ({ ...r, __source: custom.name }));
        for (const id of descendants) {
          const sub = await store.listRecords(id);
          rows = rows.concat(sub.map((r) => ({ ...r, __source: nameById.get(id) ?? id })));
        }

        const cols = descendants.length ? [...custom.columns, SOURCE_COL] : custom.columns;
        const ds = new JsonDataSource(rows, cols);
        const [records, facets] = await Promise.all([ds.list(params), ds.facets()]);
        const total = q || params.filters ? (await ds.list()).length : records.length;
        return Response.json({ columns: cols, records, facets, total, base: baseId, custom: true });
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
  let total = userNarrowed ? (await ds.list(baseParams)).length : records.length;

  // подмешиваем записи пользовательских баз, вложенных в этот раздел
  let merged = records;
  try {
    const store = getCustomStore();
    const me = await currentEmail();
    // чужие базы в раздел не подмешиваем
    const all = (await store.listBases()).filter((b) => !b.owner || b.owner === me);
    const kids = new Map<string, string[]>();
    for (const b of all) {
      if (!b.parent) continue;
      kids.set(b.parent, [...(kids.get(b.parent) ?? []), b.id]);
    }
    const descendants: string[] = [];
    const walk = (id: string) => {
      for (const child of kids.get(id) ?? []) {
        descendants.push(child);
        walk(child);
      }
    };
    walk(base.id);

    if (descendants.length) {
      const nameById = new Map(all.map((b) => [b.id, b.name]));
      merged = records.map((r) => ({ ...r, __source: base.name }));
      for (const id of descendants) {
        const sub = await store.listRecords(id);
        merged = merged.concat(sub.map((r) => ({ ...r, __source: nameById.get(id) ?? id })));
      }
      columns = [...columns, SOURCE_COL];
      facets = { ...facets, __source: [...new Set(merged.map((r) => String(r.__source ?? '')))].filter(Boolean) };
      total = merged.length;
    }
  } catch (e) {
    console.error('nested bases merge failed:', e);
  }

  return Response.json({ columns, records: merged, facets, total, base: base.id, custom: false });
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
    const me = await currentEmail();
    if (base.owner && base.owner !== me) {
      return Response.json({ error: 'Нет доступа к этой базе' }, { status: 403 });
    }
    const record = await store.addRecord(baseId, data);
    return Response.json({ record });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка добавления строки';
    return Response.json({ error: msg }, { status: 500 });
  }
}

// обновить одну ячейку строки в пользовательской базе
export async function PATCH(request: Request): Promise<Response> {
  let body: { base?: unknown; id?: unknown; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Некорректный запрос' }, { status: 400 });
  }
  const baseId = String(body?.base ?? '');
  const id = String(body?.id ?? '');
  if (!baseId || BUILTIN_IDS.has(baseId) || !id) {
    return Response.json({ error: 'Нельзя редактировать эту строку' }, { status: 400 });
  }
  const patch = body?.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : {};

  try {
    const store = getCustomStore();
    const base = await store.getBase(baseId);
    const me = await currentEmail();
    if (base?.owner && base.owner !== me) {
      return Response.json({ error: 'Нет доступа к этой базе' }, { status: 403 });
    }
    const record = await store.updateRecord(baseId, id, patch);
    if (!record) return Response.json({ error: 'Строка не найдена' }, { status: 404 });
    return Response.json({ record });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка обновления';
    return Response.json({ error: msg }, { status: 500 });
  }
}
