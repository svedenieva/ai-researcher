export type Cell = string | number | null;
export type ColumnType = 'text' | 'number' | 'long-text' | 'url' | 'select';

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  sortable?: boolean;
  filterable?: boolean;
}

export interface Row {
  id: string;
  [field: string]: Cell;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export interface FilterState {
  key: string;
  value: string;
}

export interface MindSheetProps {
  columns: ColumnDef[];
  records: Row[];
  sort?: SortState;
  filter?: FilterState;
  filterOptions?: Record<string, string[]>;
  search?: string;
  onSortChange: (key: string) => void;
  onFilterChange: (filter: FilterState | undefined) => void;
  onSearchChange?: (query: string) => void;
}
