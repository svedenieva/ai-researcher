// ТР-ПА-01: расчёт подтверждений тезиса. Тезис = значение опорной колонки
// (название). Подтверждающие источники = РАЗНЫЕ домены ссылок у строк этого
// тезиса (два факта с одного домена — одно подтверждение, не два). На выходе —
// перечень тезисов с числом независимых источников, по убыванию, с отметкой о
// прохождении порога (по умолчанию 5, настраивается). Чистая функция.
import type { ColumnDef } from '../datasource/types';

export const DEFAULT_THRESHOLD = 5;

export interface ThesisConfirmation {
  thesis: string;
  /** независимые источники (домены) */
  sources: string[];
  count: number;
  passes: boolean;
}

const LINK_RE = /https?:\/\/[^\s,);]+/gi;

/** регистрируемый домен ссылки (host без www и порта) */
export function domainOf(url: string): string | null {
  const m = url.match(/^https?:\/\/([^/?#]+)/i);
  if (!m) return null;
  return m[1].replace(/^www\./i, '').toLowerCase().replace(/:\d+$/, '');
}

function clean(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

const LINK_COL = /источник|source|url|ссылк|посилан|link/i;

export function countConfirmations(
  rows: Array<Record<string, unknown>>,
  columns: Array<Pick<ColumnDef, 'key' | 'label'>>,
  opts: { nameKey?: string; threshold?: number } = {},
): ThesisConfirmation[] {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const nameKey = opts.nameKey ?? columns.find((c) => !c.key.startsWith('__'))?.key;
  if (!nameKey) return [];
  const linkCols = columns.filter((c) => !c.key.startsWith('__') && LINK_COL.test(c.label + ' ' + c.key));

  const byThesis = new Map<string, Set<string>>();
  const label = new Map<string, string>();
  for (const row of rows) {
    const raw = clean(row[nameKey]);
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!label.has(key)) label.set(key, raw);
    const set = byThesis.get(key) ?? new Set<string>();
    for (const col of linkCols) {
      for (const link of clean(row[col.key]).match(LINK_RE) ?? []) {
        const d = domainOf(link);
        if (d) set.add(d);
      }
    }
    byThesis.set(key, set);
  }

  const out: ThesisConfirmation[] = [];
  for (const [key, set] of byThesis) {
    const sources = [...set].sort();
    out.push({ thesis: label.get(key) ?? key, sources, count: sources.length, passes: sources.length >= threshold });
  }
  // по убыванию числа подтверждений, затем по алфавиту
  out.sort((a, b) => b.count - a.count || a.thesis.localeCompare(b.thesis, 'ru'));
  return out;
}
