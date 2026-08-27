import type { ColumnType } from './datasource/types';

// Parsing a pasted/uploaded table. Covers "any format":
//   - paste from Google Sheets / Excel / Numbers → TSV (tab-separated);
//   - CSV file (exported from anywhere) → comma, with quotes.
// The delimiter is detected automatically. The first line is the header.

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

// We look for the delimiter only OUTSIDE quotes and only in the first record. A
// naive `text.includes('\t')` gets it wrong: a tab inside a quoted field is a
// valid value per RFC 4180, and it made the whole CSV collapse into one column.
//
// Semicolon matters as much as comma: Excel in a locale whose decimal mark is a
// comma (uk / ru / most of Europe) exports CSV with a ';' delimiter — the file
// the user most often has to hand. Missing it collapsed the whole table into one
// column. We COUNT each candidate across the first record and take the most
// frequent, so one stray ';' in a comma file (or vice-versa) doesn't fool it;
// ties fall back to comma, then tab, then semicolon.
function sniffDelimiter(t: string): string {
  const counts: Record<string, number> = { ',': 0, '\t': 0, ';': 0 };
  let inQuotes = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '"') {
      if (inQuotes && t[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ',' || ch === '\t' || ch === ';') counts[ch] += 1;
      // the first record has ended — no reason to look further
      else if (ch === '\n') break;
    }
  }
  let best = ',';
  for (const d of [',', '\t', ';']) if (counts[d] > counts[best]) best = d;
  return best;
}

export function parseTable(text: string): ParsedTable {
  // Excel adds the BOM; in the first column's name it would be invisible junk
  const t = text.replace(/^﻿/, '').replace(/(\r\n|\n)+$/, '');
  if (!t.trim()) return { headers: [], rows: [] };
  const delim = sniffDelimiter(t);

  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQuotes) {
      if (ch === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        // a line break inside quotes is part of the value, not the end of the record
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      // CRLF outside quotes is one record separator, not two
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  records.push(row);

  const headers = (records.shift() ?? []).map((h) => h.trim());
  // drop completely empty rows
  const rows = records.filter((r) => r.some((c) => c.trim() !== ''));
  return { headers, rows };
}

// column type from its values: number / url / text
export function inferType(values: string[]): ColumnType {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean);
  if (!nonEmpty.length) return 'text';
  if (nonEmpty.every((v) => /^https?:\/\//i.test(v))) return 'url';
  if (nonEmpty.every((v) => v !== '' && !Number.isNaN(Number(v.replace(',', '.'))))) return 'number';
  // few unique values → convenient as a "select" (filterable)
  const uniq = new Set(nonEmpty);
  if (uniq.size <= Math.max(2, Math.min(12, nonEmpty.length / 2))) return 'select';
  return 'text';
}
