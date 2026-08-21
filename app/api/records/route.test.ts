import { describe, it, expect } from 'vitest';
import { GET, DELETE } from './route';
import { CATALOG_COLUMNS } from '@/lib/datasource/columns';
import { getCustomStore } from '@/lib/datasource/customStore';
import { MODE_KEY, MODE_RESEARCH, MODE_REFERENCE } from '@/lib/mode';

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

describe('GET /api/records — research/reference mode', () => {
  // a base with one row of each kind; the flag is absent on the first row,
  // which is exactly how older rows look — they must count as drafts
  async function seedModeBase() {
    const store = getCustomStore();
    const base = await store.createBase({ name: 'ModeTest', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    await store.addRecord(base.id, { name: 'черновик' });
    await store.addRecord(base.id, { name: 'проверено', [MODE_KEY]: MODE_REFERENCE });
    return base;
  }

  it('tags every row with a mode, defaulting to draft', async () => {
    const base = await seedModeBase();
    const body = await (await call(`http://localhost/api/records?base=${base.id}`)).json();
    expect(body.records.length).toBe(2);
    const byName = Object.fromEntries(body.records.map((r: Record<string, string>) => [r.name, r[MODE_KEY]]));
    expect(byName['черновик']).toBe(MODE_RESEARCH);
    expect(byName['проверено']).toBe(MODE_REFERENCE);
  });

  it('narrows the base to the requested mode', async () => {
    const base = await seedModeBase();
    const u = `http://localhost/api/records?base=${base.id}&mode=${encodeURIComponent(MODE_REFERENCE)}`;
    const body = await (await call(u)).json();
    expect(body.records.map((r: { name: string }) => r.name)).toEqual(['проверено']);
  });
});

describe('DELETE /api/records', () => {
  it('soft-deletes and restores rows', async () => {
    const store = getCustomStore();
    const b = await store.createBase({ name: 'DelTest', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const r = await store.addRecord(b.id, { name: 'x' });
    const del = await DELETE(new Request('http://localhost/api/records', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: b.id, ids: [r.id] }) }));
    expect((await del.json()).deleted).toBe(1);
    expect((await store.listRecords(b.id)).length).toBe(0);
    const res = await DELETE(new Request('http://localhost/api/records', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: b.id, ids: [r.id], restore: true }) }));
    expect((await res.json()).restored).toBe(1);
    expect((await store.listRecords(b.id)).length).toBe(1);
  });

  it('rejects builtin bases', async () => {
    const res = await DELETE(new Request('http://localhost/api/records', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: 'market', ids: ['1'] }) }));
    expect(res.status).toBe(400);
  });
});
