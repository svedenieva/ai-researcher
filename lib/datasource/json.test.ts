import { describe, it, expect } from 'vitest';
import { JsonDataSource } from './json';
import type { CatalogRecord, ColumnDef } from './types';

const columns: ColumnDef[] = [
  { key: 'name', label: 'Название', type: 'text', sortable: true },
  { key: 'region', label: 'Регион', type: 'select', sortable: true, filterable: true },
  { key: 'founded', label: 'Основана', type: 'number', sortable: true },
];

const records: CatalogRecord[] = [
  { id: 'b', name: 'Beta', region: 'US', founded: 2020 },
  { id: 'a', name: 'Alpha', region: 'EU', founded: 2017 },
  { id: 'c', name: 'Gamma', region: 'EU', founded: 2019 },
];

const ds = () => new JsonDataSource(records, columns);

describe('JsonDataSource', () => {
  it('returns the provided columns', async () => {
    expect(await ds().columns()).toEqual(columns);
  });

  it('lists all records unsorted when no params', async () => {
    const r = await ds().list();
    expect(r.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts text ascending', async () => {
    const r = await ds().list({ sort: { key: 'name', dir: 'asc' } });
    expect(r.map((x) => x.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('sorts text descending', async () => {
    const r = await ds().list({ sort: { key: 'name', dir: 'desc' } });
    expect(r.map((x) => x.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('sorts numbers numerically, not lexically', async () => {
    const r = await ds().list({ sort: { key: 'founded', dir: 'asc' } });
    expect(r.map((x) => x.founded)).toEqual([2017, 2019, 2020]);
  });

  it('filters by exact select value', async () => {
    const r = await ds().list({ filter: { key: 'region', value: 'EU' } });
    expect(r.map((x) => x.id).sort()).toEqual(['a', 'c']);
  });

  it('applies filter then sort together', async () => {
    const r = await ds().list({
      filter: { key: 'region', value: 'EU' },
      sort: { key: 'founded', dir: 'desc' },
    });
    expect(r.map((x) => x.id)).toEqual(['c', 'a']);
  });

  it('sorts a select column by its explicit order, not lexically', async () => {
    const cols: ColumnDef[] = [
      { key: 'name', label: 'N', type: 'text' },
      { key: 'pop', label: 'Pop', type: 'select', sortable: true, order: ['high', 'mid', 'low'] },
    ];
    const recs: CatalogRecord[] = [
      { id: '1', name: 'a', pop: 'low' },
      { id: '2', name: 'b', pop: 'high' },
      { id: '3', name: 'c', pop: 'mid' },
    ];
    const r = await new JsonDataSource(recs, cols).list({ sort: { key: 'pop', dir: 'asc' } });
    expect(r.map((x) => x.pop)).toEqual(['high', 'mid', 'low']);
  });

  it('treats null cells as last when sorting ascending', async () => {
    const withNull = new JsonDataSource(
      [
        { id: '1', name: 'X', region: null, founded: null },
        { id: '2', name: 'Y', region: 'EU', founded: 2018 },
      ],
      columns,
    );
    const r = await withNull.list({ sort: { key: 'founded', dir: 'asc' } });
    expect(r.map((x) => x.id)).toEqual(['2', '1']);
  });

  it('treats null cells as last when sorting descending too', async () => {
    const withNull = new JsonDataSource(
      [
        { id: '1', name: 'X', region: null, founded: null },
        { id: '2', name: 'Y', region: 'EU', founded: 2018 },
      ],
      columns,
    );
    const r = await withNull.list({ sort: { key: 'founded', dir: 'desc' } });
    expect(r.map((x) => x.id)).toEqual(['2', '1']);
  });

  it('returns distinct values per filterable column over the full dataset', async () => {
    const facets = await ds().facets();
    expect(facets).toEqual({ region: ['EU', 'US'] });
  });

  it('facets are unaffected by list() filtering (always full-dataset)', async () => {
    const source = ds();
    await source.list({ filter: { key: 'region', value: 'EU' } });
    const facets = await source.facets();
    expect(facets.region).toEqual(['EU', 'US']);
  });
});

describe('JsonDataSource — multiselect (tags)', () => {
  const cols: ColumnDef[] = [
    { key: 'name', label: 'N', type: 'text' },
    { key: 'tags', label: 'Теги', type: 'multiselect', filterable: true },
  ];
  const rows: CatalogRecord[] = [
    { id: '1', name: 'A', tags: 'ai, tooling' },
    { id: '2', name: 'B', tags: 'ai' },
    { id: '3', name: 'C', tags: 'design' },
  ];
  const src = () => new JsonDataSource(rows, cols);

  it('facets split each tag so they list individually (§5.4/§5.7)', async () => {
    const f = await src().facets();
    expect(f.tags).toEqual(['ai', 'design', 'tooling']);
  });

  it('filtering by a tag matches rows that CONTAIN it, not the whole string', async () => {
    const r = await src().list({ filters: { tags: 'ai' } });
    expect(r.map((x) => x.id).sort()).toEqual(['1', '2']);
  });

  it('search matches a tag substring', async () => {
    const r = await src().list({ search: 'tooling' });
    expect(r.map((x) => x.id)).toEqual(['1']);
  });
});
