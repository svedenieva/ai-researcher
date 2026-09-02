import type { ColumnDef } from './datasource/types';
import { coerceToNumber } from './coerce';

const norm = (s: string) => s.trim().toLowerCase();

type Col = Pick<ColumnDef, 'key' | 'label' | 'type'>;

export interface MappedImport {
  /** rows keyed by the target base's column keys, values coerced by type */
  rows: Record<string, unknown>[];
  /** file headers that matched a column in the base (by label) */
  matched: string[];
  /** file headers with no column in the base — their values are dropped */
  unmatched: string[];
}

// Map a parsed table (headers = column LABELS, cells = strings) onto an existing
// base's columns, matched by label. Values land under the column KEY, coerced by
// the target column's type. This is the .md/CSV round-trip back into the SAME
// base: the base's schema is authoritative, so types are preserved (a header the
// base doesn't have is simply ignored — never re-typed or re-inferred).
export function mapImportRows(columns: Col[], headers: string[], rows: string[][]): MappedImport {
  const byLabel = new Map<string, Col>();
  const systemLabels = new Set<string>();
  for (const c of columns) {
    if (c.key.startsWith('__')) { systemLabels.add(norm(c.label)); continue; } // system columns aren't user-editable
    if (!byLabel.has(norm(c.label))) byLabel.set(norm(c.label), c);
  }

  const colFor = headers.map((h) => byLabel.get(norm(h)) ?? null);
  const matched: string[] = [];
  const unmatched: string[] = [];
  // a header for a system column (e.g. the auto «Теги» column present in the
  // export) is silently ignored — neither applied nor flagged — so re-importing
  // the raw export doesn't report spurious «skipped columns».
  headers.forEach((h, i) => {
    if (colFor[i]) matched.push(h);
    else if (!systemLabels.has(norm(h))) unmatched.push(h);
  });

  const outRows = rows.map((cells) => {
    const rec: Record<string, unknown> = {};
    colFor.forEach((col, i) => {
      if (!col) return;
      const raw = (cells[i] ?? '').trim();
      rec[col.key] = col.type === 'number' && raw !== '' ? coerceToNumber(raw) : raw;
    });
    return rec;
  });
  // drop rows that are empty across every matched column
  const nonEmpty = outRows.filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== ''));

  return { rows: nonEmpty, matched, unmatched };
}
