import type { ColumnDef } from './datasource/types';

// Выгрузка в CSV строго по RFC 4180 (https://www.rfc-editor.org/rfc/rfc4180).
// Семь правил спецификации, дословно:
//   1. записи разделяются переводом строки CRLF;
//   2. у последней записи перевод строки необязателен;
//   3. первая строка — заголовки, того же формата, что записи;
//   4. поля внутри записи разделяются запятыми;
//   5. поле может быть в двойных кавычках, а может и не быть;
//   6. поле с переводом строки, кавычкой или запятой ДОЛЖНО быть в кавычках;
//   7. кавычка внутри поля удваивается.
//
// Чего CSV не переносит — и это не наш недочёт, а свойство формата, одинаковое
// у всех семи разобранных систем: типы колонок, связи, вычисляемые значения,
// оформление. Excel про это пишет прямо: «All formatting, graphics, objects,
// and other worksheet contents are lost». Поэтому CSV у нас — канал обмена
// значениями, а не формат хранения базы.

const NEEDS_QUOTES = /[",\r\n]/;

/** Одно поле по правилам 5–7. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (!NEEDS_QUOTES.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export interface CsvTable {
  headers: string[];
  rows: Array<Array<unknown>>;
}

/**
 * Собирает CSV. Разделитель записей — CRLF (правило 1); завершающего перевода
 * строки нет (правило 2 разрешает обойтись без него, а лишняя пустая строка
 * в конце сбивает часть импортёров).
 */
export function toCsv(table: CsvTable): string {
  const lines = [table.headers.map(csvField).join(',')];
  for (const row of table.rows) lines.push(row.map(csvField).join(','));
  return lines.join('\r\n');
}

// Excel открывает UTF-8 без BOM в системной кодировке и превращает кириллицу
// в кракозябры. RFC про кодировку не говорит ничего, так что BOM — осознанное
// дополнение к спецификации ради того, чтобы файл открывался двойным кликом.
export const UTF8_BOM = '\ufeff';

/** Таблица → байты файла, готовые к отдаче. */
export function csvBytes(table: CsvTable, withBom = true): Uint8Array {
  return new TextEncoder().encode((withBom ? UTF8_BOM : '') + toCsv(table));
}

// Response по типам не принимает Uint8Array — отдаём буфер ровно по длине.
export function csvBody(table: CsvTable, withBom = true): ArrayBuffer {
  return csvBytes(table, withBom).slice().buffer as ArrayBuffer;
}

/** Значения записи в порядке колонок; для отсутствующих полей — пусто. */
export function rowsFor(
  columns: Pick<ColumnDef, 'key'>[],
  records: Array<Record<string, unknown>>,
): Array<Array<unknown>> {
  return records.map((r) => columns.map((c) => r[c.key] ?? ''));
}

// Имя файла в заголовке Content-Disposition. Кириллицу голой в заголовок класть
// нельзя, поэтому ascii-запаска + filename* с процентным кодированием (RFC 5987).
export function attachmentHeader(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}.csv"; filename*=UTF-8''${encodeURIComponent(name)}.csv`;
}
