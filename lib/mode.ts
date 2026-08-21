import type { ColumnDef } from './datasource/types';

// Per-record system flag: is this row still a draft being researched, or a
// checked/verified one. Stored under a reserved key in the record's data so it
// lives on every record, in every base, and can't be deleted like a normal
// column. Default for a new record is "draft".
export const MODE_KEY = '__mode';
export const MODE_RESEARCH = 'Черновик';
export const MODE_REFERENCE = 'Проверено';
export const MODE_VALUES = [MODE_RESEARCH, MODE_REFERENCE] as const;

// Values written before the rename — still present in stored records, so they
// are mapped onto the current pair instead of being treated as unknown.
const LEGACY_REFERENCE = 'Эталон';

export type RecordMode = typeof MODE_RESEARCH | typeof MODE_REFERENCE;

// The system "mode" column injected into custom bases. It lives here rather
// than in the page so the grid and the CSV export describe the same table —
// the file used to omit a column the screen was showing.
export const MODE_COLUMN: ColumnDef = {
  key: MODE_KEY,
  label: 'Режим',
  type: 'select',
  sortable: true,
  filterable: false,
  badge: true,
  badgeVariant: { [MODE_RESEARCH]: 'teal', [MODE_REFERENCE]: 'amber' },
  order: [MODE_RESEARCH, MODE_REFERENCE],
};

// Place the mode column right after the name column, as the grid does.
export function withModeColumn(columns: ColumnDef[]): ColumnDef[] {
  if (!columns.length) return columns;
  return [columns[0], MODE_COLUMN, ...columns.slice(1).filter((c) => c.key !== MODE_KEY)];
}

// The mode of a record, defaulting to "draft" when the flag is absent
// (old rows, built-in catalog rows).
export function recordMode(r: Record<string, unknown>): RecordMode {
  const v = r[MODE_KEY];
  return v === MODE_REFERENCE || v === LEGACY_REFERENCE ? MODE_REFERENCE : MODE_RESEARCH;
}
