import { describe, it, expect } from 'vitest';
import catalog from '@/data/catalog.json';
import { CATALOG_COLUMNS } from './columns';

describe('catalog seed', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('every record has an id and all declared column keys', () => {
    const keys = CATALOG_COLUMNS.map((c) => c.key);
    for (const rec of catalog as Record<string, unknown>[]) {
      expect(typeof rec.id).toBe('string');
      for (const k of keys) {
        expect(rec).toHaveProperty(k);
      }
    }
  });
});
