import { describe, it, expect } from 'vitest';
import { MemoryCustomStore, canAccessBase, userCanAccess } from './customStore';

describe('per-user access (ТР-БД-03)', () => {
  it('a private base is invisible to another user until granted (НФТ-19/20)', async () => {
    const store = new MemoryCustomStore();
    const base = await store.createBase({ name: 'Личная', columns: [{ key: 'n', label: 'N', type: 'text' }], owner: 'a@x.com' });

    // owner sees it; a stranger does not
    expect((await store.listBases('a@x.com')).some((b) => b.id === base.id)).toBe(true);
    expect((await store.listBases('b@x.com')).some((b) => b.id === base.id)).toBe(false);
    expect(await userCanAccess(store, base, 'b@x.com')).toBe(false);

    // grant → visible + accessible
    await store.grantAccess(base.id, 'b@x.com');
    expect(await store.listAccess(base.id)).toEqual(['b@x.com']);
    expect((await store.listBases('b@x.com')).some((b) => b.id === base.id)).toBe(true);
    expect(await userCanAccess(store, base, 'b@x.com')).toBe(true);

    // revoke → gone again
    await store.revokeAccess(base.id, 'b@x.com');
    expect((await store.listBases('b@x.com')).some((b) => b.id === base.id)).toBe(false);
    expect(await userCanAccess(store, base, 'b@x.com')).toBe(false);
  });

  it('canAccessBase honours the granted set', () => {
    const base = { id: 'x', owner: 'a@x.com', shared: false };
    expect(canAccessBase(base, 'b@x.com')).toBe(false);
    expect(canAccessBase(base, 'b@x.com', new Set(['x']))).toBe(true);
  });

  it('shared and ownerless bases stay visible to everyone', () => {
    expect(canAccessBase({ id: '1', owner: 'a@x.com', shared: true }, 'b@x.com')).toBe(true);
    expect(canAccessBase({ id: '2', owner: null }, 'b@x.com')).toBe(true);
  });
});
