import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { CATALOG_COLUMNS } from '@/lib/datasource/columns';

function call(url: string) {
  return GET(new Request(url));
}

describe('GET /api/records', () => {
  it('returns columns and records', async () => {
    const res = await call('http://localhost/api/records');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.columns)).toBe(true);
    expect(body.columns.length).toBe(CATALOG_COLUMNS.length);
    expect(Array.isArray(body.records)).toBe(true);
    expect(body.records.length).toBeGreaterThan(0);
  });

  it('narrows records by the q search param', async () => {
    const all = await (await call('http://localhost/api/records')).json();
    const res = await call('http://localhost/api/records?q=heygen');
    const body = await res.json();
    expect(body.records.length).toBeGreaterThan(0);
    expect(body.records.length).toBeLessThan(all.records.length);
    for (const r of body.records) {
      expect(JSON.stringify(r).toLowerCase()).toContain('heygen');
    }
  });

  it('applies sort params', async () => {
    const res = await call('http://localhost/api/records?sortKey=name&sortDir=asc');
    const body = await res.json();
    const names = body.records.map((r: { name: string }) => r.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'ru'));
    expect(names).toEqual(sorted);
  });

  it('applies filter params', async () => {
    const res = await call(
      'http://localhost/api/records?filterKey=region&filterValue=EU',
    );
    const body = await res.json();
    for (const r of body.records) expect(r.region).toBe('EU');
  });

  it('combines multiple f= filters with AND', async () => {
    const all = await (await call('http://localhost/api/records')).json();
    const sample = all.records.find(
      (r: { region?: string; vertical?: string }) => r.region && r.vertical,
    );
    const u = new URL('http://localhost/api/records');
    u.searchParams.append('f', `region:${sample.region}`);
    u.searchParams.append('f', `vertical:${sample.vertical}`);
    const body = await (await call(u.toString())).json();
    expect(body.records.length).toBeGreaterThan(0);
    expect(body.records.length).toBeLessThanOrEqual(all.records.length);
    for (const r of body.records) {
      expect(r.region).toBe(sample.region);
      expect(r.vertical).toBe(sample.vertical);
    }
  });

  it('reports total as the unfiltered count when filters are applied', async () => {
    const all = await (await call('http://localhost/api/records')).json();
    const body = await (
      await call('http://localhost/api/records?f=region:EU')
    ).json();
    expect(body.total).toBe(all.records.length);
    expect(body.records.length).toBeLessThanOrEqual(body.total);
  });

  it('includes facets in the response', async () => {
    const res = await call('http://localhost/api/records');
    const body = await res.json();
    expect(body.facets).toBeDefined();
    expect(typeof body.facets).toBe('object');
  });

  it('facets are full-dataset, not narrowed by the request filter', async () => {
    const res = await call(
      'http://localhost/api/records?filterKey=region&filterValue=EU',
    );
    const body = await res.json();
    expect(body.facets.region).toEqual(expect.arrayContaining(['EU', 'US']));
  });
});
