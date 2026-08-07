import { describe, it, expect } from 'vitest';
import { PATCH, DELETE } from './route';
import { getCustomStore } from '@/lib/datasource/customStore';

function req(method: string, body: unknown) {
  return new Request('http://localhost/api/bases', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

describe('/api/bases mutations', () => {
  it('renames a base', async () => {
    const b = await getCustomStore().createBase({ name: 'Old', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const res = await PATCH(req('PATCH', { id: b.id, name: 'New' }));
    expect((await res.json()).base.name).toBe('New');
  });
  it('soft-deletes and restores a base', async () => {
    const store = getCustomStore();
    const b = await store.createBase({ name: 'Temp', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    await DELETE(req('DELETE', { id: b.id }));
    expect(await store.getBase(b.id)).toBeNull();
    await DELETE(req('DELETE', { id: b.id, restore: true }));
    expect(await store.getBase(b.id)).not.toBeNull();
  });
  it('rejects builtin bases', async () => {
    const res = await DELETE(req('DELETE', { id: 'it' }));
    expect(res.status).toBe(400);
  });

  it('reparents a base under another (happy path)', async () => {
    const store = getCustomStore();
    const p = await store.createBase({ name: 'Parent', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const c = await store.createBase({ name: 'Child', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const res = await PATCH(req('PATCH', { id: c.id, parent: p.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.base.parent).toBe(p.id);
  });

  it('rejects reparenting a base under itself', async () => {
    const store = getCustomStore();
    const x = await store.createBase({ name: 'SelfLoop', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const res = await PATCH(req('PATCH', { id: x.id, parent: x.id }));
    expect(res.status).toBe(400);
  });

  it('rejects a two-base cycle (A under B, then B under A)', async () => {
    const store = getCustomStore();
    const a = await store.createBase({ name: 'CycleA', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const bb = await store.createBase({ name: 'CycleB', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const first = await PATCH(req('PATCH', { id: a.id, parent: bb.id }));
    expect(first.status).toBe(200);
    const second = await PATCH(req('PATCH', { id: bb.id, parent: a.id }));
    expect(second.status).toBe(400);
  });
});
