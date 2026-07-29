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
