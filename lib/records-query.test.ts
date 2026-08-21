import { describe, it, expect } from 'vitest';
import { recordsQuery } from './records-query';
import { DEFAULT_BASE } from './datasource/bases';
import { MODE_REFERENCE } from './mode';

const EMPTY = { base: DEFAULT_BASE, filters: {}, search: '', mode: 'all' };

describe('recordsQuery', () => {
  it('is empty for the default view', () => {
    expect(recordsQuery(EMPTY)).toBe('');
  });

  it('omits the base only when it is the default one', () => {
    expect(recordsQuery({ ...EMPTY, base: 'ai' })).toContain('base=ai');
    expect(recordsQuery(EMPTY)).not.toContain('base=');
  });

  it('carries sort, filters and search', () => {
    const qs = new URLSearchParams(
      recordsQuery({ ...EMPTY, sort: { key: 'name', dir: 'desc' }, filters: { region: 'EU' }, search: ' heygen ' }),
    );
    expect(qs.get('sortKey')).toBe('name');
    expect(qs.get('sortDir')).toBe('desc');
    expect(qs.getAll('f')).toEqual(['region:EU']);
    expect(qs.get('q')).toBe('heygen');
  });

  // the reason this builder exists: the CSV link used to be assembled separately
  // and forgot the mode, so "Проверено" on screen downloaded as every row
  it('carries the mode filter, and drops it when set to all', () => {
    const qs = new URLSearchParams(recordsQuery({ ...EMPTY, mode: MODE_REFERENCE }));
    expect(qs.get('mode')).toBe(MODE_REFERENCE);
    expect(recordsQuery(EMPTY)).not.toContain('mode=');
  });
});
