import type { ColumnType } from './datasource/types';

// Разбор вставленной/загруженной таблицы. Покрывает «любой формат»:
//   - вставка из Google Sheets / Excel / Numbers → TSV (таб-разделитель);
//   - CSV-файл (экспорт откуда угодно) → запятая, с кавычками.
// Разделитель определяется автоматически. Первая строка — заголовки.

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export function parseTable(text: string): ParsedTable {
  const t = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!t.trim()) return { headers: [], rows: [] };
  // таб есть → это TSV (из таблиц), иначе CSV
  const delim = t.includes('\t') ? '\t' : ',';

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
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
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
  // отбрасываем полностью пустые строки
  const rows = records.filter((r) => r.some((c) => c.trim() !== ''));
  return { headers, rows };
}

// тип колонки по её значениям: число / ссылка / текст
export function inferType(values: string[]): ColumnType {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean);
  if (!nonEmpty.length) return 'text';
  if (nonEmpty.every((v) => /^https?:\/\//i.test(v))) return 'url';
  if (nonEmpty.every((v) => v !== '' && !Number.isNaN(Number(v.replace(',', '.'))))) return 'number';
  // мало уникальных значений → удобно как «выбор» (фильтруемое)
  const uniq = new Set(nonEmpty);
  if (uniq.size <= Math.max(2, Math.min(12, nonEmpty.length / 2))) return 'select';
  return 'text';
}
