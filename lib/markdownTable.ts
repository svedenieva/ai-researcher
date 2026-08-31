// Serialize a table to a Markdown pipe table — the round-trippable «.md» format
// (decision A: Postgres source + a .md overlay). It is the exact inverse of
// parseMarkdownTable in ./parseTable: header row, a separator row of dashes, then
// one line per record. Cells escape «|» as «\|» and flatten newlines to spaces,
// because a Markdown table cell is single-line; parseMarkdownTable trims cells
// and unescapes «\|», so `parseTable(toMarkdownTable(t))` returns the same table.

// The table shape both the CSV path (rowsFor → unknown[][]) and the tests
// (string[][]) satisfy; every cell is coerced to string here.
export interface ExportTable {
  headers: string[];
  rows: unknown[][];
}

function cell(v: unknown): string {
  return String(v ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function row(cells: unknown[]): string {
  return `| ${cells.map(cell).join(' | ')} |`;
}

export function toMarkdownTable(table: ExportTable): string {
  const headers = table.headers ?? [];
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const lines = [row(headers), sep, ...(table.rows ?? []).map(row)];
  return lines.join('\n');
}
