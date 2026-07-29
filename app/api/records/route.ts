import { getDataSource } from '@/lib/datasource';
import type { ListParams } from '@/lib/datasource/types';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params: ListParams = {};

  const sortKey = url.searchParams.get('sortKey');
  const sortDir = url.searchParams.get('sortDir');
  if (sortKey) {
    params.sort = { key: sortKey, dir: sortDir === 'desc' ? 'desc' : 'asc' };
  }

  const filterKey = url.searchParams.get('filterKey');
  const filterValue = url.searchParams.get('filterValue');
  if (filterKey && filterValue) {
    params.filter = { key: filterKey, value: filterValue };
  }

  const q = url.searchParams.get('q');
  if (q) {
    params.search = q;
  }

  const ds = getDataSource();
  const [columns, records, facets] = await Promise.all([
    ds.columns(),
    ds.list(params),
    ds.facets(),
  ]);
  return Response.json({ columns, records, facets });
}
