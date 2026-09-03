import { describe, it, expect } from 'vitest';
import { stageReport, STAGES } from './knowledge-stages';
import type { CatalogRecord, ColumnDef } from './datasource/types';

const cols: ColumnDef[] = [
  { key: 'название', label: 'Название', type: 'text' },
  { key: 'стадия', label: 'Стадия', type: 'select' },
];
const NOW = Date.parse('2026-01-11T00:00:00Z');
const rec = (id: string, stage?: string, updatedDaysAgo?: number): CatalogRecord =>
  ({
    id,
    ...(stage ? { стадия: stage } : {}),
    ...(updatedDaysAgo !== undefined ? { __updated: new Date(NOW - updatedDaysAgo * 86_400_000).toISOString() } : {}),
  }) as CatalogRecord;

describe('stageReport (ТР-БЗ-09)', () => {
  it('returns all five stages in order with counts', () => {
    const rows = [rec('a', 'изучение', 2), rec('b', 'изучение', 4), rec('c', 'внедрение', 10), rec('d')];
    const r = stageReport(rows, cols, NOW);
    expect(r.stageKey).toBe('стадия');
    expect(r.buckets.map((b) => b.stage)).toEqual([...STAGES]);
    const byStage = Object.fromEntries(r.buckets.map((b) => [b.stage, b]));
    expect(byStage['изучение'].count).toBe(2);
    expect(byStage['изучение'].avgDays).toBe(3); // (2+4)/2
    expect(byStage['внедрение'].count).toBe(1);
    expect(byStage['внедрение'].avgDays).toBe(10);
    expect(byStage['обучение'].count).toBe(0);
    expect(byStage['обучение'].avgDays).toBeNull();
    expect(r.noStage).toBe(1); // record d
  });

  it('no stage column → everything counts as no-stage', () => {
    const r = stageReport([rec('a')], [{ key: 'название', label: 'Название', type: 'text' }], NOW);
    expect(r.stageKey).toBeNull();
    expect(r.noStage).toBe(1);
  });
});
