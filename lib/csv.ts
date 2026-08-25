import type { ColumnDef } from './datasource/types';

// CSV export strictly per RFC 4180 (https://www.rfc-editor.org/rfc/rfc4180).
// The seven rules of the spec, verbatim:
//   1. records are separated by a CRLF line break;
//   2. the last record's line break is optional;
//   3. the first line is the header, in the same format as the records;
//   4. fields within a record are separated by commas;
//   5. a field may or may not be wrapped in double quotes;
//   6. a field containing a line break, quote, or comma MUST be quoted;
//   7. a quote inside a field is doubled.
//
// What CSV cannot carry — and this is not our shortcoming but a property of the
// format, the same across all seven systems we surveyed: column types, relations,
// computed values, formatting. Excel says so plainly: «All formatting, graphics,
// objects, and other worksheet contents are lost». So for us CSV is a channel for
// exchanging values, not a storage format for the base.

const NEEDS_QUOTES = /[",\r\n]/;

// Excel and Google Sheets execute a cell whose text begins with one of these —
// `=cmd|…`, `=HYPERLINK(…)`, `=IMPORTXML(…)` — as a FORMULA on open. The RFC says
// nothing about it, so on top of quoting we neutralise such a cell by prefixing
// an apostrophe, which makes the app treat it as text. Plain numbers (incl.
// negative like -5) are left alone: they are values, not formulas.
const FORMULA_START = /^[=+\-@\t\r]/;
function neutralizeFormula(s: string): string {
  if (!FORMULA_START.test(s)) return s;
  const n = Number(s);
  if (s.trim() !== '' && Number.isFinite(n)) return s; // a real number, not a formula
  return `'${s}`;
}

/** A single field per rules 5–7, with formula injection neutralised first. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = neutralizeFormula(String(value));
  if (!NEEDS_QUOTES.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export interface CsvTable {
  headers: string[];
  rows: Array<Array<unknown>>;
}

/**
 * Assembles the CSV. Records are separated by CRLF (rule 1); there is no
 * trailing line break (rule 2 allows omitting it, and an extra empty line at
 * the end trips up some importers).
 */
export function toCsv(table: CsvTable): string {
  const lines = [table.headers.map(csvField).join(',')];
  for (const row of table.rows) lines.push(row.map(csvField).join(','));
  return lines.join('\r\n');
}

// Excel opens UTF-8 without a BOM in the system encoding and turns Cyrillic into
// mojibake. The RFC says nothing about encoding, so the BOM is a deliberate
// addition to the spec so the file opens with a double-click.
export const UTF8_BOM = '\ufeff';

/** Table → file bytes, ready to serve. */
export function csvBytes(table: CsvTable, withBom = true): Uint8Array {
  return new TextEncoder().encode((withBom ? UTF8_BOM : '') + toCsv(table));
}

// Response doesn't accept a Uint8Array by type — return a buffer of the exact length.
export function csvBody(table: CsvTable, withBom = true): ArrayBuffer {
  return csvBytes(table, withBom).slice().buffer as ArrayBuffer;
}

/** Record values in column order; empty for missing fields. */
export function rowsFor(
  columns: Pick<ColumnDef, 'key'>[],
  records: Array<Record<string, unknown>>,
): Array<Array<unknown>> {
  return records.map((r) => columns.map((c) => r[c.key] ?? ''));
}

// File name in the Content-Disposition header. Cyrillic can't go into a header
// bare, so an ascii fallback + filename* with percent-encoding (RFC 5987).
export function attachmentHeader(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}.csv"; filename*=UTF-8''${encodeURIComponent(name)}.csv`;
}
