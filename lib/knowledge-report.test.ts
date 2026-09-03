import { describe, it, expect } from 'vitest';
import { typeReport, NO_CATEGORY } from './knowledge-report';
import type { CatalogRecord, ColumnDef } from './datasource/types';

const cols: ColumnDef[] = [
  { key: 'название', label: 'Название', type: 'text' },
  { key: 'тип', label: 'Тип', type: 'select' },
];
const rec = (id: string, type?: string) => ({ id, название: id, ...(type ? { тип: type } : {}) }) as CatalogRecord;

describe('typeReport (ТР-БЗ-02)', () => {
  it('groups by the type column and reports the typeless ones', () => {
    const rows = [rec('a', 'Промпт'), rec('b', 'Промпт'), rec('c', 'Скилл'), rec('d')];
    const r = typeReport(rows, cols);
    expect(r.typeKey).toBe('тип');
    expect(r.byType[0]).toEqual({ type: 'Промпт', count: 2 });
    expect(r.byType.find((x) => x.type === NO_CATEGORY)).toEqual({ type: NO_CATEGORY, count: 1 });
    expect(r.missing).toEqual(['d']);
    expect(r.missingCount).toBe(1);
  });

  it('«без категории» sorts last', () => {
    const r = typeReport([rec('a'), rec('b', 'X')], cols);
    expect(r.byType[r.byType.length - 1].type).toBe(NO_CATEGORY);
  });

  it('no type column → nothing to group by', () => {
    const r = typeReport([rec('a')], [{ key: 'название', label: 'Название', type: 'text' }]);
    expect(r.typeKey).toBeNull();
    expect(r.missingCount).toBe(0);
  });
});
