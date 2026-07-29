import { describe, it, expect } from 'vitest';
import { GET } from './route';

function call(url: string) {
  return GET(new Request(url));
}

describe('GET /api/records', () => {
  it('returns columns and records', async () => {
    const res = await call('http://localhost/api/records');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.columns)).toBe(true);
    expect(body.columns.length).toBe(16);
    expect(Array.isArray(body.records)).toBe(true);
    expect(body.records.length).toBeGreaterThan(0);
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
});
