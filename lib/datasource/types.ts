export type Cell = string | number | null;

export interface CatalogRecord {
  id: string;
  [field: string]: Cell;
}

export type ColumnType = 'text' | 'number' | 'long-text' | 'url' | 'select';

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  sortable?: boolean;
  filterable?: boolean;
}

export interface ListParams {
  sort?: { key: string; dir: 'asc' | 'desc' };
  filter?: { key: string; value: string };
}

export interface DataSource {
  columns(): Promise<ColumnDef[]>;
  list(params?: ListParams): Promise<CatalogRecord[]>;
  facets(): Promise<Record<string, string[]>>;
}
