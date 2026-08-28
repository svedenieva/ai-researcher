export type Cell = string | number | null;

export interface CatalogRecord {
  id: string;
  [field: string]: Cell;
}

export type ColumnType = 'text' | 'number' | 'long-text' | 'url' | 'select' | 'multiselect' | 'date' | 'checkbox' | 'rating';

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  sortable?: boolean;
  filterable?: boolean;
  /** explicit sort order for select values (most-important first) */
  order?: string[];
  /** render select values as coloured pills */
  badge?: boolean;
  /** value → colour variant (green|teal|blue|amber|red|purple|grey) */
  badgeVariant?: Record<string, string>;
}

export interface ListParams {
  sort?: { key: string; dir: 'asc' | 'desc' };
  /** legacy single filter — still honoured alongside `filters` */
  filter?: { key: string; value: string };
  /** multiple simultaneous filters (column key → value), combined with AND */
  filters?: Record<string, string>;
  search?: string;
}

export interface DataSource {
  columns(): Promise<ColumnDef[]>;
  list(params?: ListParams): Promise<CatalogRecord[]>;
  facets(): Promise<Record<string, string[]>>;
  get(id: string): Promise<CatalogRecord | null>;
}
