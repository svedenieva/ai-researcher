// ТР-ПА-02: перевод записи «Черновик → Эталон». Переводить можно только запись
// с проверенной цитатой и рабочей ссылкой. Guard чистый и тестируемый; сам
// перевод (смена __mode + запись истории) делает маршрут.
import type { CatalogRecord, ColumnDef } from '../datasource/types';
import { extractUrls, isFetchableUrl, CHECK_COLUMN } from './links';

export type PromoteReason = 'no-quote' | 'no-link' | 'check-failed';

const RE_QUOTE = /цитата|quote/i;
const RE_LINK = /источник|source|url|ссылк|посилан|link/i;
const RE_CHECK_FAIL = /битая|dead|blocked|✗|нет на|not found|missing/i;

export function canPromote(record: CatalogRecord, columns: ColumnDef[]): { ok: boolean; reason?: PromoteReason } {
  const quoteCol = columns.find((c) => !c.key.startsWith('__') && RE_QUOTE.test(c.label + ' ' + c.key));
  const quote = quoteCol ? String(record[quoteCol.key] ?? '').trim() : '';
  if (!quote) return { ok: false, reason: 'no-quote' };

  const linkCols = columns.filter((c) => !c.key.startsWith('__') && RE_LINK.test(c.label + ' ' + c.key));
  const links = linkCols.flatMap((c) => extractUrls(record[c.key]));
  if (!links.some(isFetchableUrl)) return { ok: false, reason: 'no-link' };

  // если запись уже проверялась и проверка провалена — не переводим
  const check = String(record[CHECK_COLUMN.key] ?? '');
  if (RE_CHECK_FAIL.test(check)) return { ok: false, reason: 'check-failed' };

  return { ok: true };
}

/** История перевода — кто и когда (ТР-ПА-02, хранится в записи под __promoted). */
export interface PromotionMark {
  by: string;
  at: string;
}
