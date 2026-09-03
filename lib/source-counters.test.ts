import { describe, it, expect } from 'vitest';
import { classifySource, countSources, normMet } from './source-counters';
import type { CatalogRecord, ColumnDef } from './datasource/types';

const cols: ColumnDef[] = [
  { key: 'name', label: 'Название', type: 'text' },
  { key: 'link', label: 'Ссылка', type: 'url' },
  { key: 'type', label: 'Тип', type: 'select' },
];
const rec = (o: Partial<CatalogRecord>): CatalogRecord => ({ id: 'r', ...o }) as CatalogRecord;

describe('classifySource', () => {
  it('classifies by URL host', () => {
    expect(classifySource(rec({ link: 'https://github.com/openai/gpt' }), cols)).toBe('repos');
    expect(classifySource(rec({ link: 'https://youtube.com/@ai' }), cols)).toBe('channels');
    expect(classifySource(rec({ link: 'https://www.linkedin.com/in/john' }), cols)).toBe('experts');
    expect(classifySource(rec({ link: 'https://x.com/sama' }), cols)).toBe('pages');
    expect(classifySource(rec({ link: 'https://example.com/tool' }), cols)).toBe('pages');
  });

  it('explicit type column wins over URL guess', () => {
    expect(classifySource(rec({ link: 'https://github.com/x', type: 'Эксперт' }), cols)).toBe('experts');
    expect(classifySource(rec({ type: 'Канал' }), cols)).toBe('channels');
  });

  it('no url, no type → other', () => {
    expect(classifySource(rec({ name: 'что-то' }), cols)).toBe('other');
  });
});

describe('countSources + normMet', () => {
  it('counts by category and checks norms (≥10 experts, ≥20 repos)', () => {
    const rows: CatalogRecord[] = [
      ...Array.from({ length: 12 }, (_, i) => rec({ id: `e${i}`, link: `https://linkedin.com/in/p${i}` })),
      ...Array.from({ length: 5 }, (_, i) => rec({ id: `r${i}`, link: `https://github.com/o/r${i}` })),
      rec({ id: 'c', link: 'https://youtu.be/abc' }),
    ];
    const c = countSources(rows, cols);
    expect(c.experts).toBe(12);
    expect(c.repos).toBe(5);
    expect(c.channels).toBe(1);
    expect(c.total).toBe(18);
    expect(normMet('experts', c)).toBe(true); // 12 ≥ 10
    expect(normMet('repos', c)).toBe(false); // 5 < 20
    expect(normMet('channels', c)).toBeUndefined(); // no norm
  });
});
