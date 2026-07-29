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

  const ds = getDataSource();
  const [columns, records] = await Promise.all([ds.columns(), ds.list(params)]);
  return Response.json({ columns, records });
}
