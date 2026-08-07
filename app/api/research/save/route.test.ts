import { describe, it, expect } from 'vitest';
import { POST } from './route';
import { getCustomStore } from '@/lib/datasource/customStore';
import type { Finding } from '@/lib/research/types';

const report: Finding[] = [{
  subtopic: 'Игроки', summary: '', findings: [], source: 'web',
  sources: [{ title: 's', url: 'https://s.com' }],
  relevant: [
    { id: 'heygen', name: 'HeyGen', verdict: null, vertical: 'video', url: 'https://heygen.com' },
    { id: 'web:Foo', name: 'Foo', verdict: null, vertical: 'x', url: 'https://foo.com' },
  ],
}];

function req(body: unknown) {
  return new Request('http://localhost/api/research/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/research/save', () => {
  it('creates a new base with the report rows', async () => {
    const res = await POST(req({ report, target: { mode: 'new', name: 'AI видео' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(2);
    expect(body.skipped).toBe(0);
    const rows = await getCustomStore().listRecords(body.baseId);
    expect(rows.map((r) => r.name).sort()).toEqual(['Foo', 'HeyGen']);
  });

  it('appends to an existing base, skipping duplicates by name', async () => {
    const store = getCustomStore();
    const base = await store.createBase({ name: 'Existing', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    await store.addRecord(base.id, { name: 'HeyGen' });
    const res = await POST(req({ report, target: { mode: 'existing', baseId: base.id } }));
    const body = await res.json();
    expect(body.added).toBe(1);     // only Foo is new
    expect(body.skipped).toBe(1);   // HeyGen already there
  });

  it('rejects a builtin base', async () => {
    const res = await POST(req({ report, target: { mode: 'existing', baseId: 'market' } }));
    expect(res.status).toBe(400);
  });

  it('rejects an empty report', async () => {
    const res = await POST(req({ report: [], target: { mode: 'new', name: 'x' } }));
    expect(res.status).toBe(400);
  });
});
