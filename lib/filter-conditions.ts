// Фильтр по условию (ТР-МШ-07): операторы + вложенные условия (И/ИЛИ).
// Матчинг идёт по уже загруженным строкам на клиенте — сервер отдаёт всю базу,
// а условия сужают её без обращений наружу. Модель сериализуется в URL.
import type { CatalogRecord, ColumnDef } from './datasource/types';
import { splitTags } from './tags';

export type FilterOp =
  | 'contains'
  | 'ncontains'
  | 'eq'
  | 'ne'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'empty'
  | 'nempty';

/** операторы, которым не нужно значение */
export const NO_VALUE_OPS: FilterOp[] = ['empty', 'nempty'];

export interface Condition {
  key: string;
  op: FilterOp;
  value?: string;
}
/** вложенная группа условий со своим соединителем */
export interface CondGroup {
  match: 'all' | 'any';
  conds: Condition[];
}
export type FilterNode = Condition | CondGroup;
export interface FilterModel {
  match: 'all' | 'any';
  items: FilterNode[];
}

export const emptyFilterModel = (): FilterModel => ({ match: 'all', items: [] });
export const isGroup = (n: FilterNode): n is CondGroup => (n as CondGroup).conds !== undefined;

function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '';
}

// Числовое сравнение для number/rating, иначе — регистронезависимое строковое.
function cmp(cell: unknown, value: string, col?: ColumnDef): number {
  if (col?.type === 'number' || col?.type === 'rating') {
    const a = Number(String(cell).replace(',', '.'));
    const b = Number(String(value).replace(',', '.'));
    if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  }
  return String(cell ?? '').localeCompare(value, undefined, { numeric: true, sensitivity: 'base' });
}

export function matchCondition(record: CatalogRecord, c: Condition, columns: ColumnDef[]): boolean {
  const col = columns.find((x) => x.key === c.key);
  const raw = record[c.key];
  if (c.op === 'empty') return !hasValue(raw);
  if (c.op === 'nempty') return hasValue(raw);
  const value = c.value ?? '';
  const cellText = String(raw ?? '').toLowerCase();
  const needle = value.toLowerCase();
  switch (c.op) {
    case 'contains':
      if (col?.type === 'multiselect') return splitTags(raw).some((t) => t.toLowerCase().includes(needle));
      return cellText.includes(needle);
    case 'ncontains':
      if (col?.type === 'multiselect') return !splitTags(raw).some((t) => t.toLowerCase().includes(needle));
      return !cellText.includes(needle);
    case 'eq':
      if (col?.type === 'multiselect') return splitTags(raw).some((t) => t.toLowerCase() === needle);
      return cmp(raw, value, col) === 0;
    case 'ne':
      if (col?.type === 'multiselect') return !splitTags(raw).some((t) => t.toLowerCase() === needle);
      return cmp(raw, value, col) !== 0;
    case 'gt':
      return hasValue(raw) && cmp(raw, value, col) > 0;
    case 'lt':
      return hasValue(raw) && cmp(raw, value, col) < 0;
    case 'gte':
      return hasValue(raw) && cmp(raw, value, col) >= 0;
    case 'lte':
      return hasValue(raw) && cmp(raw, value, col) <= 0;
    default:
      return true;
  }
}

function matchNode(record: CatalogRecord, node: FilterNode, columns: ColumnDef[]): boolean {
  if (isGroup(node)) {
    if (!node.conds.length) return true;
    return node.match === 'all'
      ? node.conds.every((c) => matchCondition(record, c, columns))
      : node.conds.some((c) => matchCondition(record, c, columns));
  }
  return matchCondition(record, node, columns);
}

/** проходит ли строка модель условий (пустая модель пропускает всё) */
export function matchesModel(record: CatalogRecord, model: FilterModel, columns: ColumnDef[]): boolean {
  const active = model.items.filter((n) => (isGroup(n) ? n.conds.length > 0 : true));
  if (!active.length) return true;
  return model.match === 'all'
    ? active.every((n) => matchNode(record, n, columns))
    : active.some((n) => matchNode(record, n, columns));
}

export function countConditions(model: FilterModel): number {
  return model.items.reduce((n, item) => n + (isGroup(item) ? item.conds.length : 1), 0);
}

// ── сериализация в URL ──────────────────────────────────────────────
// Компактно: JSON в один параметр. Пустая модель → пусто.
export function encodeConditions(model: FilterModel): string {
  if (!countConditions(model)) return '';
  return JSON.stringify(model);
}
export function decodeConditions(raw: string | null): FilterModel {
  if (!raw) return emptyFilterModel();
  try {
    const m = JSON.parse(raw) as FilterModel;
    if (!m || !Array.isArray(m.items)) return emptyFilterModel();
    return { match: m.match === 'any' ? 'any' : 'all', items: m.items };
  } catch {
    return emptyFilterModel();
  }
}
