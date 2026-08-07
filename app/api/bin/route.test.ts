import { describe, it, expect } from 'vitest';
import { GET, DELETE } from './route';
import { getCustomStore } from '@/lib/datasource/customStore';

describe('/api/bin', () => {
  it('lists binned items and empties only with confirm', async () => {
    const store = getCustomStore();
    const b = await store.createBase({ name: 'Trashy', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    await store.softDeleteBase(b.id);
    const list = await (await GET()).json();
    expect(list.bases.some((x: { id: string }) => x.id === b.id)).toBe(true);
    // dry-run
    const dry = await (await DELETE(new Request('http://localhost/api/bin', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }))).json();
    expect(dry.dryRun).toBe(true);
    expect(await store.getBase(b.id)).toBeNull(); // still soft-deleted, not gone
    // confirm
    const done = await (await DELETE(new Request('http://localhost/api/bin', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) }))).json();
    expect(done.emptied).toBe(true);
    expect((await store.listBin()).bases.length).toBe(0);
  });
});
