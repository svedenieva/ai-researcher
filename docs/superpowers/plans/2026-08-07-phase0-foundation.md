# Phase 0 — Foundation (DB + shared data layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `deleted_at` soft-delete column to the custom-base tables and extend `customStore.ts` with soft-delete, restore, empty-bin, base rename/move, and column-mutation methods — the data layer every later phase builds on.

**Architecture:** All logic lands in `lib/datasource/customStore.ts`, which already has two backends behind one `CustomStore` interface: `MemoryCustomStore` (dev/tests) and `SupabaseCustomStore` (prod). We extend the interface and both backends identically, and make every read filter out `deleted_at IS NULL`. Tests run against `MemoryCustomStore` (no Supabase needed).

**Tech Stack:** TypeScript, Next.js, Supabase JS client, Vitest.

## Global Constraints

- Node/Next app; tests via `npm test` (Vitest, jsdom) from repo root `C:\Users\nehoc\ai-researcher`.
- Builtin base ids `market / ai / it / workforce` are read-only — never writable/deletable. `BUILTIN_IDS` is defined in callers, not in `customStore`; `customStore` operates only on custom bases and simply won't find a builtin (they aren't in the `bases` table), so no extra guard needed here.
- Column **key is immutable**: rename/update changes `label`/`type`/`filterable` only, never `key`.
- Delete is soft (`deleted_at = now()`); only `emptyBin` issues a real SQL `DELETE`.
- Both backends must behave identically; every new method has a `MemoryCustomStore` test.
- Preserve existing degradation pattern: on a Supabase "column does not exist" error for `deleted_at`, fall back to the unfiltered query (mirrors the existing `owner_email` / `parent` handling).
- Column type union: `type ColumnType = 'text' | 'number' | 'long-text' | 'url' | 'select'` (from `lib/datasource/types.ts`).

---

### Task 1: Schema migration for `deleted_at`

**Files:**
- Modify: `supabase/schema.sql` (append canonical `bases`/`base_records` DDL + `deleted_at`)

**Interfaces:**
- Consumes: nothing.
- Produces: `bases.deleted_at`, `base_records.deleted_at` columns (once applied in Supabase by the user).

- [ ] **Step 1: Verify live table shapes before writing DDL**

The `bases`/`base_records` tables were created in the Supabase console and are NOT in `schema.sql`. Before appending `create table if not exists`, confirm the real column names/types so the file matches reality (the `if not exists` will no-op on the live tables). Ask the user to run in Supabase SQL Editor and share output:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_name in ('bases','base_records')
order by table_name, ordinal_position;
```

Reconcile any differences into the DDL below before committing.

- [ ] **Step 2: Append the migration to `supabase/schema.sql`**

```sql
-- ─────────────────────────────────────────────────────────────
--  Пользовательские базы (цель №1) и их строки.
--  Раньше создавались руками в консоли; здесь — канонический DDL.
--  jsonb `columns`/`data` — схема без миграций; deleted_at — корзина.
-- ─────────────────────────────────────────────────────────────
create table if not exists bases (
  id          text primary key,
  name        text not null,
  tone        text,
  columns     jsonb not null default '[]',
  parent      text,
  owner_email text,
  created_at  timestamptz not null default now()
);
create table if not exists base_records (
  id         uuid primary key default gen_random_uuid(),
  base_id    text not null references bases(id),
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- корзина: delete → выставляет deleted_at; restore → null; empty → реальный DELETE
alter table bases        add column if not exists deleted_at timestamptz;
alter table base_records add column if not exists deleted_at timestamptz;
create index if not exists bases_deleted_at_idx        on bases (deleted_at);
create index if not exists base_records_deleted_at_idx on base_records (deleted_at);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): canonical bases/base_records DDL + deleted_at recycle-bin column"
```

> The user applies this SQL in the Supabase SQL Editor when convenient. Code changes in later tasks tolerate the column being absent, so merging before it's applied is safe.

---

### Task 2: Model `deleted_at` in the store + filter reads

**Files:**
- Modify: `lib/datasource/customStore.ts`
- Test: `lib/datasource/customStore.test.ts` (create)

**Interfaces:**
- Consumes: existing `CustomStore`, `MemoryCustomStore`, `SupabaseCustomStore`, `CustomBase`, `CatalogRecord`.
- Produces:
  - `MemoryCustomStore` now stores a `deletedBases: Set<string>` and per-record deleted flag so tests can model the bin.
  - Reads (`listBases`, `getBase`, `listRecords`) exclude soft-deleted items.
  - New private helper `SupabaseCustomStore.selectMaybeDeleted(...)` is NOT needed yet; filtering added per-read in later tasks. This task only wires memory-backend deletion state + read filtering and a test harness.

- [ ] **Step 1: Write the failing test**

```ts
// lib/datasource/customStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCustomStore } from './customStore';

function fresh() {
  return new MemoryCustomStore();
}

describe('MemoryCustomStore soft-delete visibility', () => {
  it('hides a soft-deleted base from listBases/getBase', async () => {
    const s = fresh();
    const b = await s.createBase({ name: 'Temp', columns: [{ key: 'name', label: 'Название', type: 'text' }] });
    await s.softDeleteBase(b.id);
    expect(await s.getBase(b.id)).toBeNull();
    expect((await s.listBases()).find((x) => x.id === b.id)).toBeUndefined();
  });

  it('hides soft-deleted records from listRecords', async () => {
    const s = fresh();
    const b = await s.createBase({ name: 'Temp', columns: [{ key: 'name', label: 'Название', type: 'text' }] });
    const r = await s.addRecord(b.id, { name: 'row-1' });
    await s.softDeleteRecords(b.id, [r.id]);
    expect((await s.listRecords(b.id)).find((x) => x.id === r.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- customStore`
Expected: FAIL — `softDeleteBase` / `softDeleteRecords` are not functions, and `MemoryCustomStore` is not exported.

- [ ] **Step 3: Export `MemoryCustomStore` and add deletion state + read filtering**

In `lib/datasource/customStore.ts`:
1. Add `export` to `class MemoryCustomStore`.
2. Extend the interface `CustomStore` with the new signatures (add near the existing ones):

```ts
  renameBase(id: string, name: string): Promise<CustomBase | null>;
  moveBase(id: string, parent: string | null): Promise<CustomBase | null>;
  softDeleteBase(id: string): Promise<boolean>;
  restoreBase(id: string): Promise<boolean>;
  softDeleteRecords(baseId: string, ids: string[]): Promise<number>;
  restoreRecords(baseId: string, ids: string[]): Promise<number>;
  listBin(): Promise<BinContents>;
  emptyBin(scope?: { baseId?: string }): Promise<{ bases: number; records: number }>;
  addColumn(baseId: string, col: NewColumn): Promise<CustomBase | null>;
  updateColumn(baseId: string, key: string, patch: ColumnPatch): Promise<CustomBase | null>;
  deleteColumn(baseId: string, key: string): Promise<CustomBase | null>;
```

3. Add the shared types near the top (after `NewBase`):

```ts
export type NewColumn = { label: string; type?: ColumnDef['type']; filterable?: boolean };
export type ColumnPatch = { label?: string; type?: ColumnDef['type']; filterable?: boolean };
export interface BinRecord { baseId: string; baseName: string; record: CatalogRecord }
export interface BinContents { bases: CustomBase[]; records: BinRecord[] }
```

4. In `MemoryCustomStore`, track deletion. Add fields and adjust reads:

```ts
  private deletedBases = new Set<string>();
  private deletedRows: Record<string, Set<string>> = {};

  async listBases() {
    return this.bases.filter((b) => !this.deletedBases.has(b.id));
  }
  async getBase(id: string) {
    if (this.deletedBases.has(id)) return null;
    return this.bases.find((b) => b.id === id) ?? null;
  }
  async listRecords(baseId: string) {
    const gone = this.deletedRows[baseId] ?? new Set<string>();
    return (this.rows[baseId] ?? []).filter((r) => !gone.has(r.id));
  }

  async softDeleteBase(id: string) {
    if (!this.bases.some((b) => b.id === id)) return false;
    this.deletedBases.add(id);
    return true;
  }
  async softDeleteRecords(baseId: string, ids: string[]) {
    const set = (this.deletedRows[baseId] ??= new Set());
    let n = 0;
    for (const id of ids) if ((this.rows[baseId] ?? []).some((r) => r.id === id) && !set.has(id)) { set.add(id); n++; }
    return n;
  }
```

(Remaining new methods are stubbed in this task only enough to satisfy the interface; they get real tests in Tasks 3–7. Add minimal throwing stubs OR implement now — Task 3–7 tests will drive them. To keep the interface compiling, add `restoreBase`, `restoreRecords`, `listBin`, `emptyBin`, `renameBase`, `moveBase`, `addColumn`, `updateColumn`, `deleteColumn` as implemented in later tasks; for now add them returning the neutral value so the file compiles:)

```ts
  async restoreBase(id: string) { const had = this.deletedBases.delete(id); return had; }
  async restoreRecords(baseId: string, ids: string[]) {
    const set = this.deletedRows[baseId]; if (!set) return 0;
    let n = 0; for (const id of ids) if (set.delete(id)) n++; return n;
  }
  async listBin(): Promise<BinContents> {
    const bases = this.bases.filter((b) => this.deletedBases.has(b.id));
    const records: BinRecord[] = [];
    for (const [baseId, set] of Object.entries(this.deletedRows)) {
      const base = this.bases.find((b) => b.id === baseId);
      for (const r of this.rows[baseId] ?? []) if (set.has(r.id)) records.push({ baseId, baseName: base?.name ?? baseId, record: r });
    }
    return { bases, records };
  }
  async emptyBin(scope?: { baseId?: string }) {
    let bases = 0, records = 0;
    const baseIds = scope?.baseId ? [scope.baseId] : [...this.deletedBases];
    for (const id of baseIds) if (this.deletedBases.delete(id)) { this.bases = this.bases.filter((b) => b.id !== id); delete this.rows[id]; delete this.deletedRows[id]; bases++; }
    for (const [baseId, set] of Object.entries(this.deletedRows)) {
      if (scope?.baseId && scope.baseId !== baseId) continue;
      const rows = this.rows[baseId] ?? [];
      this.rows[baseId] = rows.filter((r) => !set.has(r.id));
      records += set.size; set.clear();
    }
    return { bases, records };
  }
  async renameBase(id: string, name: string) { const b = this.bases.find((x) => x.id === id); if (!b || this.deletedBases.has(id)) return null; b.name = name; return b; }
  async moveBase(id: string, parent: string | null) { const b = this.bases.find((x) => x.id === id); if (!b || this.deletedBases.has(id)) return null; b.parent = parent; return b; }
  async addColumn(baseId: string, col: NewColumn) { return this.mutateColumns(baseId, (cols) => [...cols, normalizeNewColumn(col, cols)]); }
  async updateColumn(baseId: string, key: string, patch: ColumnPatch) {
    return this.mutateColumns(baseId, (cols) => cols.map((c) => c.key === key ? applyColumnPatch(c, patch) : c));
  }
  async deleteColumn(baseId: string, key: string) { return this.mutateColumns(baseId, (cols) => cols.filter((c) => c.key !== key)); }
  private async mutateColumns(baseId: string, fn: (cols: ColumnDef[]) => ColumnDef[]) {
    const b = this.bases.find((x) => x.id === baseId); if (!b || this.deletedBases.has(baseId)) return null;
    b.columns = fn(b.columns); return b;
  }
```

5. Add the pure helpers `normalizeNewColumn` and `applyColumnPatch` at module scope (used by both backends — DRY):

```ts
// новую колонку: label→key (стабильный), type по умолчанию text, filterable
// не для url/long-text (как в create_base)
export function normalizeNewColumn(col: NewColumn, existing: ColumnDef[]): ColumnDef {
  const label = String(col.label ?? '').trim();
  let key = label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/(^_|_$)/g, '') || `col${existing.length}`;
  const used = new Set(existing.map((c) => c.key));
  while (used.has(key)) key = `${key}_`;
  const type: ColumnDef['type'] = (['number', 'url', 'long-text', 'select'] as const).includes(col.type as never) ? col.type! : 'text';
  return { key, label, type, sortable: true, filterable: Boolean(col.filterable) && type !== 'long-text' && type !== 'url' };
}
// патч колонки: key НЕИЗМЕНЕН; label/type/filterable опционально; filterable
// пересчитывается под новый тип
export function applyColumnPatch(col: ColumnDef, patch: ColumnPatch): ColumnDef {
  const type = patch.type ?? col.type;
  const label = patch.label !== undefined ? String(patch.label).trim() || col.label : col.label;
  const filterable = (patch.filterable ?? col.filterable ?? false) && type !== 'long-text' && type !== 'url';
  return { ...col, label, type, filterable };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- customStore`
Expected: PASS (both visibility tests).

- [ ] **Step 5: Commit**

```bash
git add lib/datasource/customStore.ts lib/datasource/customStore.test.ts
git commit -m "feat(store): model deleted_at in MemoryCustomStore, filter reads, add column helpers"
```

---

### Task 3: Supabase backend — base soft-delete / restore / rename / move

**Files:**
- Modify: `lib/datasource/customStore.ts` (`SupabaseCustomStore`)
- Test: `lib/datasource/customStore.test.ts` (extend — memory backend already covered; add rename/move memory tests)

**Interfaces:**
- Consumes: `SupabaseCustomStore.client`, existing `norm`, `listBases`.
- Produces: `SupabaseCustomStore.{softDeleteBase,restoreBase,renameBase,moveBase}` matching the interface. Reads (`listBases`, `getBase`) filter `deleted_at IS NULL` with graceful fallback.

- [ ] **Step 1: Write the failing test (memory backend, behaviour parity)**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails/passes**

Run: `npm test -- customStore`
Expected: PASS for memory (already implemented in Task 2). This task's *code* work is the Supabase mirror, which these tests don't exercise directly — that's acceptable: the Supabase backend has no unit harness in this repo (same as today). Verify the memory tests pass, then implement the Supabase methods below by inspection against the existing `norm`/insert patterns.

- [ ] **Step 3: Implement the Supabase methods**

Add to `SupabaseCustomStore`, and add `.is('deleted_at', null)` to `listBases`/`getBase` with fallback:

```ts
  private async listBasesFiltered(): Promise<CustomBase[]> {
    let q = this.client.from('bases').select('*').order('created_at', { ascending: true });
    let { data, error } = await q.is('deleted_at', null);
    if (error && /deleted_at/.test(error.message)) {
      ({ data, error } = await this.client.from('bases').select('*').order('created_at', { ascending: true }));
    }
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return (data ?? []).map((r) => this.norm(r as Record<string, unknown>));
  }
```

Replace `listBases`'s body to call `listBasesFiltered()`. In `getBase`, append `.is('deleted_at', null)` with the same fallback on a `deleted_at` error. Then:

```ts
  async softDeleteBase(id: string): Promise<boolean> {
    const { error } = await this.client.from('bases').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return true;
  }
  async restoreBase(id: string): Promise<boolean> {
    const { error } = await this.client.from('bases').update({ deleted_at: null }).eq('id', id);
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return true;
  }
  async renameBase(id: string, name: string): Promise<CustomBase | null> {
    const { data, error } = await this.client.from('bases').update({ name }).eq('id', id).is('deleted_at', null).select('*').maybeSingle();
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return data ? this.norm(data as Record<string, unknown>) : null;
  }
  async moveBase(id: string, parent: string | null): Promise<CustomBase | null> {
    const { data, error } = await this.client.from('bases').update({ parent }).eq('id', id).is('deleted_at', null).select('*').maybeSingle();
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return data ? this.norm(data as Record<string, unknown>) : null;
  }
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- customStore && npx tsc --noEmit`
Expected: tests PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/datasource/customStore.ts lib/datasource/customStore.test.ts
git commit -m "feat(store): Supabase base soft-delete/restore/rename/move + deleted_at read filter"
```

---

### Task 4: Supabase backend — record soft-delete / restore + read filter

**Files:**
- Modify: `lib/datasource/customStore.ts` (`SupabaseCustomStore`)
- Test: `lib/datasource/customStore.test.ts` (extend — memory record restore)

**Interfaces:**
- Consumes: `SupabaseCustomStore.listRecords`.
- Produces: `SupabaseCustomStore.{softDeleteRecords,restoreRecords}`; `listRecords` filters `deleted_at IS NULL`.

- [ ] **Step 1: Write the failing test (memory restore)**

```ts
it('restoreRecords brings rows back', async () => {
  const s = new MemoryCustomStore();
  const b = await s.createBase({ name: 'T', columns: [{ key: 'name', label: 'N', type: 'text' }] });
  const r = await s.addRecord(b.id, { name: 'x' });
  await s.softDeleteRecords(b.id, [r.id]);
  expect(await s.restoreRecords(b.id, [r.id])).toBe(1);
  expect((await s.listRecords(b.id)).some((x) => x.id === r.id)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it passes (memory)**

Run: `npm test -- customStore`
Expected: PASS.

- [ ] **Step 3: Implement Supabase record methods + read filter**

In `SupabaseCustomStore.listRecords`, add `.is('deleted_at', null)` before `.order(...)`, with the same `deleted_at`-missing fallback used for bases. Add:

```ts
  async softDeleteRecords(baseId: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const { error, count } = await this.client
      .from('base_records')
      .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
      .eq('base_id', baseId).in('id', ids);
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    return count ?? ids.length;
  }
  async restoreRecords(baseId: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const { error, count } = await this.client
      .from('base_records')
      .update({ deleted_at: null }, { count: 'exact' })
      .eq('base_id', baseId).in('id', ids);
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    return count ?? ids.length;
  }
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- customStore && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/datasource/customStore.ts lib/datasource/customStore.test.ts
git commit -m "feat(store): Supabase record soft-delete/restore + deleted_at read filter"
```

---

### Task 5: Supabase backend — listBin + emptyBin

**Files:**
- Modify: `lib/datasource/customStore.ts` (`SupabaseCustomStore`)
- Test: `lib/datasource/customStore.test.ts` (extend — memory bin lifecycle)

**Interfaces:**
- Consumes: `BinContents`, `BinRecord`, `norm`.
- Produces: `SupabaseCustomStore.{listBin,emptyBin}`.

- [ ] **Step 1: Write the failing test (memory bin lifecycle)**

```ts
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
```

- [ ] **Step 2: Run test to verify it passes (memory)**

Run: `npm test -- customStore`
Expected: PASS (memory `listBin`/`emptyBin` implemented in Task 2).

- [ ] **Step 3: Implement Supabase `listBin` / `emptyBin`**

```ts
  async listBin(): Promise<BinContents> {
    const { data: bd, error: be } = await this.client.from('bases').select('*').not('deleted_at', 'is', null);
    if (be) throw new Error(`Supabase (bases): ${be.message}`);
    const bases = (bd ?? []).map((r) => this.norm(r as Record<string, unknown>));
    // имена всех баз (в т.ч. живых) — для подписи строк в корзине
    const { data: allBases } = await this.client.from('bases').select('id, name');
    const nameById = new Map((allBases ?? []).map((b) => [String((b as { id: string }).id), String((b as { name: string }).name)]));
    const { data: rd, error: re } = await this.client.from('base_records').select('id, base_id, data').not('deleted_at', 'is', null);
    if (re) throw new Error(`Supabase (base_records): ${re.message}`);
    const records: BinRecord[] = (rd ?? []).map((r) => {
      const row = r as { id: string; base_id: string; data: Record<string, unknown> };
      return { baseId: row.base_id, baseName: nameById.get(row.base_id) ?? row.base_id, record: { id: row.id, ...row.data } as CatalogRecord };
    });
    return { bases, records };
  }
  async emptyBin(scope?: { baseId?: string }): Promise<{ bases: number; records: number }> {
    // строки: удаляем помеченные (по base_id, если задан scope)
    let recDel = this.client.from('base_records').delete({ count: 'exact' }).not('deleted_at', 'is', null);
    if (scope?.baseId) recDel = recDel.eq('base_id', scope.baseId);
    const { count: recCount, error: re } = await recDel;
    if (re) throw new Error(`Supabase (base_records): ${re.message}`);
    // базы: удаляем помеченные; сначала их строки целиком (FK), затем сами базы
    let bases = 0;
    let binnedBaseQ = this.client.from('bases').select('id').not('deleted_at', 'is', null);
    if (scope?.baseId) binnedBaseQ = binnedBaseQ.eq('id', scope.baseId);
    const { data: binnedBases, error: bqe } = await binnedBaseQ;
    if (bqe) throw new Error(`Supabase (bases): ${bqe.message}`);
    for (const b of binnedBases ?? []) {
      const id = String((b as { id: string }).id);
      await this.client.from('base_records').delete().eq('base_id', id); // включая живые строки удаляемой базы
      const { error: de } = await this.client.from('bases').delete().eq('id', id);
      if (de) throw new Error(`Supabase (bases): ${de.message}`);
      bases++;
    }
    return { bases, records: recCount ?? 0 };
  }
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- customStore && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/datasource/customStore.ts lib/datasource/customStore.test.ts
git commit -m "feat(store): Supabase listBin/emptyBin (only empty issues a real DELETE)"
```

---

### Task 6: Supabase backend — column mutations

**Files:**
- Modify: `lib/datasource/customStore.ts` (`SupabaseCustomStore`)
- Test: `lib/datasource/customStore.test.ts` (extend — memory column rules)

**Interfaces:**
- Consumes: `normalizeNewColumn`, `applyColumnPatch`, `getBase`.
- Produces: `SupabaseCustomStore.{addColumn,updateColumn,deleteColumn}`.

- [ ] **Step 1: Write the failing test (the §5.3 data-retention rule)**

```ts
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
```

- [ ] **Step 2: Run test to verify it passes (memory)**

Run: `npm test -- customStore`
Expected: PASS (memory column methods implemented in Task 2).

- [ ] **Step 3: Implement Supabase column mutations**

```ts
  private async writeColumns(baseId: string, cols: ColumnDef[]): Promise<CustomBase | null> {
    const { data, error } = await this.client.from('bases').update({ columns: cols }).eq('id', baseId).is('deleted_at', null).select('*').maybeSingle();
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return data ? this.norm(data as Record<string, unknown>) : null;
  }
  async addColumn(baseId: string, col: NewColumn): Promise<CustomBase | null> {
    const base = await this.getBase(baseId); if (!base) return null;
    return this.writeColumns(baseId, [...base.columns, normalizeNewColumn(col, base.columns)]);
  }
  async updateColumn(baseId: string, key: string, patch: ColumnPatch): Promise<CustomBase | null> {
    const base = await this.getBase(baseId); if (!base) return null;
    return this.writeColumns(baseId, base.columns.map((c) => c.key === key ? applyColumnPatch(c, patch) : c));
  }
  async deleteColumn(baseId: string, key: string): Promise<CustomBase | null> {
    const base = await this.getBase(baseId); if (!base) return null;
    return this.writeColumns(baseId, base.columns.filter((c) => c.key !== key));
  }
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- customStore && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/datasource/customStore.ts lib/datasource/customStore.test.ts
git commit -m "feat(store): Supabase column add/update/delete (key immutable, data retained)"
```

---

### Task 7: Full-suite regression + phase gate

**Files:**
- Test: whole repo.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass, including the untouched `smoke.test.ts`, `app/api/records/route.test.ts`, `lib/datasource/*.test.ts`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm no behaviour change for existing readers**

Manually confirm `listBases`/`listRecords` still return live data (the new filters only exclude soft-deleted rows, of which there are none yet).

- [ ] **Step 4: Commit any final touch-ups**

```bash
git add -A && git commit -m "test(store): phase-0 foundation green" || echo "nothing to commit"
```

## Self-Review

- **Spec coverage:** §5 rules (soft delete, empty-only-destructive, immutable key, retype coercion, no column bin), §6 migration — all mapped to Tasks 1–6. Cross-surface invariant is a Phase 1/2 concern (this phase has no reader but the store itself). ✓
- **Placeholders:** none; every method has concrete code. ✓
- **Type consistency:** `NewColumn`/`ColumnPatch`/`BinContents`/`BinRecord` defined in Task 2 and reused verbatim in Tasks 5–6. `normalizeNewColumn`/`applyColumnPatch` defined once, used by both backends. ✓
