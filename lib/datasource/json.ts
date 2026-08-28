import type { CatalogRecord, ColumnDef, DataSource, ListParams } from './types';
import { splitTags } from '../tags';

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

    // Both the legacy single `filter` and the multi `filters` map apply,
    // combined with AND (each narrows the set further).
    const active: Array<[string, string]> = [];
    if (params?.filter) active.push([params.filter.key, params.filter.value]);
    if (params?.filters) active.push(...Object.entries(params.filters));
    for (const [key, value] of active) {
      const col = this.cols.find((c) => c.key === key);
      // a multiselect cell holds several tags — match rows that CONTAIN the
      // picked tag, not ones whose whole value equals it
      if (col?.type === 'multiselect') {
        rows = rows.filter((r) => splitTags(r[key]).includes(value));
      } else {
        rows = rows.filter((r) => String(r[key] ?? '') === value);
      }
    }

    if (params?.sort) {
      const { key, dir } = params.sort;
      const col = this.cols.find((c) => c.key === key);
      rows.sort((a, b) => compare(a[key], b[key], col, dir));
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
        // a multiselect column's facet lists each tag on its own
        if (col.type === 'multiselect') for (const t of splitTags(value)) set.add(t);
        else set.add(String(value));
      }
      result[col.key] = [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }
    return result;
  }
}

function compare(
  a: CatalogRecord[string],
  b: CatalogRecord[string],
  col: ColumnDef | undefined,
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
  // explicit importance order for select columns (values not listed go last)
  if (col?.order) {
    const rank = (v: CatalogRecord[string]) => {
      const i = col.order!.indexOf(String(v));
      return i === -1 ? col.order!.length : i;
    };
    return (rank(a) - rank(b)) * factor;
  }
  if (col?.type === 'number') return (Number(a) - Number(b)) * factor;
  return String(a).localeCompare(String(b), 'ru') * factor;
}
