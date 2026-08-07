import { describe, it, expect } from 'vitest';
import { reportToRows, REPORT_COLUMNS } from './saveReport';
import type { Finding } from './types';

const f = (subtopic: string, relevant: Finding['relevant'], sources: Finding['sources'] = []): Finding =>
  ({ subtopic, summary: '', findings: [], relevant, sources, source: 'web' });

describe('reportToRows', () => {
  it('maps relevant companies to rows with source urls', () => {
    const rows = reportToRows([
      f('Игроки', [{ id: 'heygen', name: 'HeyGen', verdict: null, vertical: 'video', url: 'https://heygen.com' }],
        [{ title: 'a', url: 'https://src1.com' }]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'HeyGen', what: 'video', url: 'https://heygen.com', subtopic: 'Игроки', status: 'в каталоге' });
    expect(rows[0].sources).toContain('https://src1.com');
  });

  it('dedups the same company across subtopics, merging subtopics and sources', () => {
    const c = { id: 'web:Foo', name: 'Foo', verdict: null, vertical: 'x', url: 'https://foo.com' };
    const rows = reportToRows([
      f('A', [c], [{ title: '1', url: 'https://s1.com' }]),
      f('B', [c], [{ title: '2', url: 'https://s2.com' }]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].subtopic).toBe('A, B');
    expect(rows[0].sources).toContain('https://s1.com');
    expect(rows[0].sources).toContain('https://s2.com');
    expect(rows[0].status).toBe('новое'); // web: id, never in catalog
  });

  it('prefers "в каталоге" when a company appears both ways', () => {
    const rows = reportToRows([
      f('A', [{ id: 'web:Bar', name: 'Bar', verdict: null, vertical: null, url: null }]),
      f('B', [{ id: 'bar', name: 'Bar', verdict: null, vertical: null, url: null }]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('в каталоге');
  });

  it('invents nothing for empty relevant, and skips nameless entries', () => {
    expect(reportToRows([f('A', [])])).toEqual([]);
    expect(reportToRows([f('A', [{ id: 'x', name: '  ', verdict: null, vertical: null, url: null }])])).toEqual([]);
  });

  it('exposes six columns with stable keys', () => {
    expect(REPORT_COLUMNS.map((c) => c.key)).toEqual(['name', 'what', 'url', 'subtopic', 'status', 'sources']);
  });
});
