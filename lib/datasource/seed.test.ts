import { describe, it, expect } from 'vitest';
import catalog from '@/data/catalog.json';
import { CATALOG_COLUMNS } from './columns';
import { withSections } from './section';
import type { CatalogRecord } from './types';

describe('catalog seed', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('every record has an id and all declared column keys', () => {
    const keys = CATALOG_COLUMNS.map((c) => c.key);
    // `section` is derived from `vertical`, not stored in the seed — check the
    // enriched records so every declared column resolves.
    for (const rec of withSections(catalog as CatalogRecord[])) {
      expect(typeof rec.id).toBe('string');
      for (const k of keys) {
        expect(rec).toHaveProperty(k);
      }
    }
  });
});
