// ТР-БЗ-02: группировка элементов базы знаний по типу и отчёт о неполноте.
// Элементы без типа собираются в «без категории» и попадают в отчёт. Чистая
// функция; UI показывает бейдж/фильтр, грид группирует по найденной колонке.
import type { CatalogRecord, ColumnDef } from './datasource/types';

const RE_TYPE = /тип|катего|раздел|вид\b|kind|type|group/i;
export const NO_CATEGORY = 'Без категории';

export interface TypeReport {
  /** ключ колонки-типа, если найдена */
  typeKey: string | null;
  typeLabel: string | null;
  /** распределение по типам (ключ — значение типа или NO_CATEGORY) */
  byType: Array<{ type: string; count: number }>;
  /** id элементов без типа — отчёт о неполноте */
  missing: string[];
  missingCount: number;
  total: number;
}

function clean(v: unknown): string {
  return String(v ?? '').trim();
}

export function typeReport(records: CatalogRecord[], columns: ColumnDef[]): TypeReport {
  // предпочитаем select-колонку с подходящим названием, иначе любую подходящую
  const cands = columns.filter((c) => !c.key.startsWith('__') && RE_TYPE.test(`${c.label} ${c.key}`));
  const col = cands.find((c) => c.type === 'select') ?? cands[0] ?? null;
  if (!col) return { typeKey: null, typeLabel: null, byType: [], missing: [], missingCount: 0, total: records.length };

  const counts = new Map<string, number>();
  const missing: string[] = [];
  for (const r of records) {
    const v = clean(r[col.key]);
    const key = v || NO_CATEGORY;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!v) missing.push(String(r.id));
  }
  const byType = [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => (a.type === NO_CATEGORY ? 1 : b.type === NO_CATEGORY ? -1 : b.count - a.count));

  return { typeKey: col.key, typeLabel: col.label, byType, missing, missingCount: missing.length, total: records.length };
}
