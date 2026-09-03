import { describe, it, expect } from 'vitest';
import { matchesModel, decodeConditions, encodeConditions, emptyFilterModel, type FilterModel } from './filter-conditions';
import type { CatalogRecord, ColumnDef } from './datasource/types';

const cols: ColumnDef[] = [
  { key: 'name', label: 'Название', type: 'text' },
  { key: 'price', label: 'Цена', type: 'number' },
  { key: 'region', label: 'Регион', type: 'select' },
  { key: 'tags', label: 'Теги', type: 'multiselect' },
];
const rec = (o: Partial<CatalogRecord>): CatalogRecord => ({ id: 'r1', ...o }) as CatalogRecord;

describe('matchesModel', () => {
  it('empty model passes everything', () => {
    expect(matchesModel(rec({ name: 'x' }), emptyFilterModel(), cols)).toBe(true);
  });

  it('contains / not-contains on text', () => {
    const m: FilterModel = { match: 'all', items: [{ key: 'name', op: 'contains', value: 'Gen' }] };
    expect(matchesModel(rec({ name: 'HeyGen' }), m, cols)).toBe(true);
    expect(matchesModel(rec({ name: 'Runway' }), m, cols)).toBe(false);
  });

  it('numeric gt / lte compare as numbers, not strings', () => {
    const gt: FilterModel = { match: 'all', items: [{ key: 'price', op: 'gt', value: '90' }] };
    expect(matchesModel(rec({ price: 100 }), gt, cols)).toBe(true);
    expect(matchesModel(rec({ price: 9 }), gt, cols)).toBe(false); // "9" < "90" as string, but 9 < 90 numerically
  });

  it('AND requires all, OR requires any', () => {
    const conds = [
      { key: 'region', op: 'eq' as const, value: 'US' },
      { key: 'price', op: 'gte' as const, value: '50' },
    ];
    const rowUsCheap = rec({ region: 'US', price: 10 });
    expect(matchesModel(rowUsCheap, { match: 'all', items: conds }, cols)).toBe(false);
    expect(matchesModel(rowUsCheap, { match: 'any', items: conds }, cols)).toBe(true);
  });

  it('empty / not-empty', () => {
    const empty: FilterModel = { match: 'all', items: [{ key: 'region', op: 'empty' }] };
    expect(matchesModel(rec({ region: '' }), empty, cols)).toBe(true);
    expect(matchesModel(rec({ region: 'EU' }), empty, cols)).toBe(false);
  });

  it('multiselect contains matches a single tag', () => {
    const m: FilterModel = { match: 'all', items: [{ key: 'tags', op: 'contains', value: 'video' }] };
    expect(matchesModel(rec({ tags: 'video, ai' }), m, cols)).toBe(true);
    expect(matchesModel(rec({ tags: 'coding' }), m, cols)).toBe(false);
  });

  it('nested group: top OR of (AND group) and a plain condition', () => {
    const m: FilterModel = {
      match: 'any',
      items: [
        { match: 'all', conds: [ { key: 'region', op: 'eq', value: 'EU' }, { key: 'price', op: 'lt', value: '20' } ] },
        { key: 'name', op: 'contains', value: 'Synth' },
      ],
    };
    expect(matchesModel(rec({ region: 'EU', price: 10, name: 'x' }), m, cols)).toBe(true); // group matches
    expect(matchesModel(rec({ region: 'US', price: 999, name: 'Synthesia' }), m, cols)).toBe(true); // plain cond matches
    expect(matchesModel(rec({ region: 'US', price: 999, name: 'Runway' }), m, cols)).toBe(false); // neither
  });

  it('URL round-trip preserves the model', () => {
    const m: FilterModel = { match: 'any', items: [{ key: 'price', op: 'gt', value: '5' }] };
    expect(decodeConditions(encodeConditions(m))).toEqual(m);
    expect(encodeConditions(emptyFilterModel())).toBe('');
    expect(decodeConditions('not json')).toEqual(emptyFilterModel());
  });
});
