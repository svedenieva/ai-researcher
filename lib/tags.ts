import type { ColumnDef } from './datasource/types';

// Per-record tags: a free-form multiselect system column. Same idea as __mode —
// a reserved key that lives on every record's data, in every base, and can't be
// deleted like a normal column — but user-editable and free-form (any tag).
// Stored as a comma-separated string in the record data (fits the string Cell
// type and the JSON store); the grid renders it as pills.
//
// Tags unblock searching by topic (§5.4 — the value is a searchable string) and
// assembling nodes by theme instead of authors (§5.7 — a row groups under each
// of its tags in the mind-sheet's multi-value grouping).

export const TAGS_KEY = '__tags';

/** A tag list from a comma-separated string (an array is accepted defensively):
    trimmed, empties dropped, duplicates collapsed, order kept. */
export function splitTags(v: unknown): string[] {
  const parts = Array.isArray(v) ? v : String(v ?? '').split(',');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const t = String(p ?? '').trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

// The system "tags" column injected into custom bases. Filterable (which also
// turns on grouping levels) so a base can be cut by topic; badged so the pills
// read at a glance.
export const TAGS_COLUMN: ColumnDef = {
  key: TAGS_KEY,
  label: 'Теги',
  type: 'multiselect',
  sortable: true,
  filterable: true,
  badge: true,
};

/** Place the tags column right after the name column; never duplicate it. */
export function withTagsColumn(columns: ColumnDef[]): ColumnDef[] {
  if (!columns.length) return columns;
  return [columns[0], TAGS_COLUMN, ...columns.slice(1).filter((c) => c.key !== TAGS_KEY)];
}
