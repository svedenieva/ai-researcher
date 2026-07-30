import type { CatalogRecord, ColumnDef, DataSource, ListParams } from './types';

export class JsonDataSource implements DataSource {
  constructor(
    private readonly records: CatalogRecord[],
    private readonly cols: ColumnDef[],
  ) {}

  async columns(): Promise<ColumnDef[]> {
    return this.cols;
  }

  async list(params?: ListParams): Promise<CatalogRecord[]> {
    let rows = [...this.records];

    const query = params?.search?.trim().toLowerCase();
    if (query) {
      rows = rows.filter((r) =>
        Object.values(r)
          .filter((v) => typeof v === 'string')
          .join(' ')
          .toLowerCase()
          .includes(query),
      );
    }

    if (params?.filter) {
      const { key, value } = params.filter;
      rows = rows.filter((r) => String(r[key] ?? '') === value);
    }

    if (params?.sort) {
      const { key, dir } = params.sort;
      const isNumber = this.cols.find((c) => c.key === key)?.type === 'number';
      rows.sort((a, b) => compare(a[key], b[key], isNumber, dir));
    }

    return rows;
  }

  async get(id: string): Promise<CatalogRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }

  async facets(): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = {};
    for (const col of this.cols) {
      if (!col.filterable) continue;
      const set = new Set<string>();
      for (const record of this.records) {
        const value = record[col.key];
        if (value === null || value === undefined || value === '') continue;
        set.add(String(value));
      }
      result[col.key] = [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }
    return result;
  }
}

function compare(
  a: CatalogRecord[string],
  b: CatalogRecord[string],
  isNumber: boolean,
  dir: 'asc' | 'desc',
): number {
  const factor = dir === 'asc' ? 1 : -1;
  // Nulls always sort to the end, regardless of direction. Handling this
  // outside the `factor` multiplication (rather than negating a "null is
  // greater" comparison) keeps compare(a, b) === -compare(b, a) for every
  // input, including the null/non-null and null/null cases.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (isNumber) return (Number(a) - Number(b)) * factor;
  return String(a).localeCompare(String(b), 'ru') * factor;
}
