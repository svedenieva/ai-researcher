import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCustomStore, canAccessBase } from './customStore';

function fresh() {
  return new MemoryCustomStore();
}

describe('MemoryCustomStore soft-delete visibility', () => {
  it('hides a soft-deleted base from listBases/getBase', async () => {
    const s = fresh();
    const b = await s.createBase({ name: 'Temp', columns: [{ key: 'name', label: 'Название', type: 'text' }] });
    await s.softDeleteBase(b.id);
    expect(await s.getBase(b.id)).toBeNull();
    expect((await s.listBases(null)).find((x) => x.id === b.id)).toBeUndefined();
  });

  it('hides soft-deleted records from listRecords', async () => {
    const s = fresh();
    const b = await s.createBase({ name: 'Temp', columns: [{ key: 'name', label: 'Название', type: 'text' }] });
    const r = await s.addRecord(b.id, { name: 'row-1' });
    await s.softDeleteRecords(b.id, [r.id]);
    expect((await s.listRecords(b.id)).find((x) => x.id === r.id)).toBeUndefined();
  });
});

describe('base rename/move', () => {
  it('renames a base', async () => {
    const s = new MemoryCustomStore();
    const b = await s.createBase({ name: 'Old', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const r = await s.renameBase(b.id, 'New');
    expect(r?.name).toBe('New');
    expect((await s.getBase(b.id))?.name).toBe('New');
  });
  it('reparents a base', async () => {
    const s = new MemoryCustomStore();
    const p = await s.createBase({ name: 'Parent', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const c = await s.createBase({ name: 'Child', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const r = await s.moveBase(c.id, p.id);
    expect(r?.parent).toBe(p.id);
  });
  it('restoreBase brings a base back', async () => {
    const s = new MemoryCustomStore();
    const b = await s.createBase({ name: 'T', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    await s.softDeleteBase(b.id);
    expect(await s.restoreBase(b.id)).toBe(true);
    expect(await s.getBase(b.id)).not.toBeNull();
  });
});

it('restoreRecords brings rows back', async () => {
  const s = new MemoryCustomStore();
  const b = await s.createBase({ name: 'T', columns: [{ key: 'name', label: 'N', type: 'text' }] });
  const r = await s.addRecord(b.id, { name: 'x' });
  await s.softDeleteRecords(b.id, [r.id]);
  expect(await s.restoreRecords(b.id, [r.id])).toBe(1);
  expect((await s.listRecords(b.id)).some((x) => x.id === r.id)).toBe(true);
});

describe('bin lifecycle', () => {
  it('lists binned bases and records, empties them', async () => {
    const s = new MemoryCustomStore();
    const b = await s.createBase({ name: 'Trashy', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const keep = await s.createBase({ name: 'Keep', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const r = await s.addRecord(keep.id, { name: 'row' });
    await s.softDeleteBase(b.id);
    await s.softDeleteRecords(keep.id, [r.id]);
    const bin = await s.listBin();
    expect(bin.bases.map((x) => x.id)).toContain(b.id);
    expect(bin.records.map((x) => x.record.id)).toContain(r.id);
    const res = await s.emptyBin();
    expect(res.bases).toBe(1);
    expect(res.records).toBe(1);
    expect((await s.listBin()).bases.length).toBe(0);
    expect((await s.listBin()).records.length).toBe(0);
  });
});

describe('base isolation: private + shared', () => {
  const col = [{ key: 'name', label: 'N', type: 'text' as const }];

  it('canAccessBase: own / unowned / shared — yes; someone else\'s private — no', () => {
    expect(canAccessBase({ owner: 'a@x', shared: false }, 'a@x')).toBe(true);   // own
    expect(canAccessBase({ owner: 'a@x', shared: false }, 'b@x')).toBe(false);  // someone else's private
    expect(canAccessBase({ owner: null, shared: false }, 'b@x')).toBe(true);    // unowned (team)
    expect(canAccessBase({ owner: 'a@x', shared: true }, 'b@x')).toBe(true);    // explicitly shared
    expect(canAccessBase({ owner: 'a@x', shared: false }, null)).toBe(false);   // unauthenticated → cannot see someone else's
    expect(canAccessBase({ owner: null, shared: false }, null)).toBe(true);     // an anonymous user sees an unowned base too
  });

  it('listBases returns only the bases available to the user', async () => {
    const s = new MemoryCustomStore();
    await s.createBase({ name: 'Моя', columns: col, owner: 'a@x' });
    await s.createBase({ name: 'Чужая', columns: col, owner: 'b@x' });
    await s.createBase({ name: 'Ничейная', columns: col, owner: null });
    await s.createBase({ name: 'Общая', columns: col, owner: 'b@x', shared: true });

    const forA = (await s.listBases('a@x')).map((b) => b.name).sort();
    expect(forA).toEqual(['Моя', 'Ничейная', 'Общая']); // "Чужая" is hidden
    const forB = (await s.listBases('b@x')).map((b) => b.name).sort();
    expect(forB).toEqual(['Ничейная', 'Общая', 'Чужая']); // "Моя" is hidden
  });

  it('listAllBases sees everything (for internal needs)', async () => {
    const s = new MemoryCustomStore();
    await s.createBase({ name: 'Моя', columns: col, owner: 'a@x' });
    await s.createBase({ name: 'Чужая', columns: col, owner: 'b@x' });
    expect((await s.listAllBases()).length).toBe(2);
  });
});

describe('manual row order', () => {
  it('reorders rows to the given id order; listRecords reflects it', async () => {
    const s = new MemoryCustomStore();
    const b = await s.createBase({ name: 'T', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const a = await s.addRecord(b.id, { name: 'a' });
    const c = await s.addRecord(b.id, { name: 'b' });
    const d = await s.addRecord(b.id, { name: 'c' });
    const n = await s.reorderRecords(b.id, [d.id, a.id, c.id]);
    expect(n).toBe(3);
    expect((await s.listRecords(b.id)).map((r) => r.id)).toEqual([d.id, a.id, c.id]);
  });
  it('ids not in the list keep their place at the end', async () => {
    const s = new MemoryCustomStore();
    const b = await s.createBase({ name: 'T', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    const a = await s.addRecord(b.id, { name: 'a' });
    const c = await s.addRecord(b.id, { name: 'b' });
    await s.reorderRecords(b.id, [c.id]); // only c mentioned → c first, a after
    expect((await s.listRecords(b.id)).map((r) => r.id)).toEqual([c.id, a.id]);
  });
});

describe('column mutations (data-retention rules)', () => {
  it('deleting a column keeps the underlying cell data', async () => {
    const s = new MemoryCustomStore();
    const b = await s.createBase({ name: 'T', columns: [
      { key: 'name', label: 'N', type: 'text' }, { key: 'note', label: 'Note', type: 'text' },
    ] });
    const r = await s.addRecord(b.id, { name: 'x', note: 'keepme' });
    await s.deleteColumn(b.id, 'note');
    expect((await s.getBase(b.id))?.columns.some((c) => c.key === 'note')).toBe(false);
    // data survives; re-adding a column with same key surfaces it again
    const rec = (await s.listRecords(b.id)).find((x) => x.id === r.id)!;
    expect(rec.note).toBe('keepme');
  });
  it('rename changes label but never key', async () => {
    const s = new MemoryCustomStore();
    const b = await s.createBase({ name: 'T', columns: [{ key: 'note', label: 'Note', type: 'text' }] });
    await s.updateColumn(b.id, 'note', { label: 'Заметка' });
    const col = (await s.getBase(b.id))!.columns.find((c) => c.key === 'note')!;
    expect(col.label).toBe('Заметка');
    expect(col.key).toBe('note');
  });
  it('add column derives a stable key and honours filterable rules', async () => {
    const s = new MemoryCustomStore();
    const b = await s.createBase({ name: 'T', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    await s.addColumn(b.id, { label: 'Цена', type: 'number', filterable: true });
    const col = (await s.getBase(b.id))!.columns.find((c) => c.label === 'Цена')!;
    expect(col.key).toBe('цена');
    expect(col.type).toBe('number');
    expect(col.filterable).toBe(true);
  });
});
