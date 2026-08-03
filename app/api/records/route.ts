import { getDataSource } from '@/lib/datasource';
import { baseById } from '@/lib/datasource/bases';
import type { ListParams } from '@/lib/datasource/types';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params: ListParams = {};

  // выбранная база фиксирует раздел каталога (section); «Рынок AI» = весь каталог
  const base = baseById(url.searchParams.get('base'));

  const sortKey = url.searchParams.get('sortKey');
  const sortDir = url.searchParams.get('sortDir');
  if (sortKey) {
    params.sort = { key: sortKey, dir: sortDir === 'desc' ? 'desc' : 'asc' };
  }

  // multiple filters: repeated `f=<key>:<value>` params (filterable keys have
  // no colon, so splitting on the first ':' is safe). Legacy filterKey/Value
  // is still accepted.
  const filters: Record<string, string> = {};
  for (const raw of url.searchParams.getAll('f')) {
    const i = raw.indexOf(':');
    if (i > 0) filters[raw.slice(0, i)] = raw.slice(i + 1);
  }
  if (Object.keys(filters).length) params.filters = filters;

  const filterKey = url.searchParams.get('filterKey');
  const filterValue = url.searchParams.get('filterValue');
  if (filterKey && filterValue) {
    params.filter = { key: filterKey, value: filterValue };
  }

  const q = url.searchParams.get('q');
  if (q) {
    params.search = q;
  }

  // база фиксирует section — добавляем его к фильтрам как AND-условие
  if (base.section) {
    params.filters = { ...(params.filters ?? {}), section: base.section };
  }

  const ds = getDataSource();
  const [allColumns, records, allFacets] = await Promise.all([
    ds.columns(),
    ds.list(params),
    ds.facets(),
  ]);

  // внутри зафиксированной базы колонка/фильтр «Раздел» постоянны — прячем их
  let columns = allColumns;
  let facets = allFacets;
  if (base.section) {
    columns = allColumns.filter((c) => c.key !== 'section');
    const { section: _section, ...rest } = allFacets;
    facets = rest;
  }

  // «показано X из N»: N — размер этой базы (без пользовательских фильтров/поиска)
  const baseParams: ListParams | undefined = base.section
    ? { filters: { section: base.section } }
    : undefined;
  const userNarrowed = Boolean(params.filter || q || (params.filters && Object.keys(params.filters).some((k) => k !== 'section')));
  const total = userNarrowed ? (await ds.list(baseParams)).length : records.length;

  return Response.json({ columns, records, facets, total, base: base.id });
}
