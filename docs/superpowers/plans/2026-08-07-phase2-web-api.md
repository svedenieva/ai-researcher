# Phase 2 — Web API Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the Phase 0 store methods over HTTP so the web UI can delete/restore rows and bases, manage columns, and drive the recycle bin.

**Architecture:** Thin Next.js route handlers over `getCustomStore()`, following the existing `app/api/records/route.ts` and `app/api/bases/route.ts` patterns (JSON in/out, `Response.json`, builtin-id guards). Business rules already live in the store (Phase 0); routes only parse/validate input and call it. Tested with the same in-process `GET(new Request(...))` style as `app/api/records/route.test.ts` (which runs the `MemoryCustomStore` backend under Vitest).

**Tech Stack:** Next.js App Router route handlers, TypeScript, Vitest.

## Global Constraints

- Depends on **Phase 0** store methods: `softDeleteRecords`, `restoreRecords`, `softDeleteBase`, `restoreBase`, `renameBase`, `moveBase`, `addColumn`, `updateColumn`, `deleteColumn`, `listBin`, `emptyBin`, and the `NewColumn`/`ColumnPatch`/`BinContents` types.
- `BUILTIN_IDS = new Set(BASES.map((b) => b.id))` — builtin bases reject all mutations with `400`.
- `empty_bin` route requires `confirm: true` in the body; otherwise returns a `{ dryRun: true, wouldDelete }` preview and deletes nothing.
- Match existing conventions: `export const dynamic = 'force-dynamic'` where the handler reads runtime data; error shape `{ error: string }` with appropriate status; success returns the affected entity/counts.
- Tests use `MemoryCustomStore` (default when `DATA_SOURCE !== 'supabase'`); seed via the store before asserting through the route.

---

### Task 1: Column routes — `/api/columns`

**Files:**
- Create: `app/api/columns/route.ts`
- Test: `app/api/columns/route.test.ts`

**Interfaces:**
- Consumes: `getCustomStore`, `NewColumn`, `ColumnPatch` from `@/lib/datasource/customStore`; `BASES` for builtin guard.
- Produces: `POST` (add), `PATCH` (update), `DELETE` (remove) → `{ base: CustomBase }` or `{ error }`.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/columns/route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { POST, PATCH, DELETE } from './route';
import { getCustomStore } from '@/lib/datasource/customStore';

function req(method: string, body: unknown) {
  return new Request('http://localhost/api/columns', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

describe('/api/columns', () => {
  let baseId: string;
  beforeEach(async () => {
    const store = getCustomStore();
    const b = await store.createBase({ name: 'ColTest', columns: [{ key: 'name', label: 'N', type: 'text' }] });
    baseId = b.id;
  });

  it('adds a column', async () => {
    const res = await POST(req('POST', { base: baseId, label: 'Цена', type: 'number' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.base.columns.some((c: { key: string }) => c.key === 'цена')).toBe(true);
  });

  it('updates label but keeps key', async () => {
    await POST(req('POST', { base: baseId, label: 'Note' }));
    const res = await PATCH(req('PATCH', { base: baseId, key: 'note', label: 'Заметка' }));
    const body = await res.json();
    const col = body.base.columns.find((c: { key: string }) => c.key === 'note');
    expect(col.label).toBe('Заметка');
  });

  it('rejects builtin bases', async () => {
    const res = await POST(req('POST', { base: 'market', label: 'X' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- columns`
Expected: FAIL — `./route` has no exports.

- [ ] **Step 3: Implement the route**

```ts
// app/api/columns/route.ts
import { BASES } from '@/lib/datasource/bases';
import { getCustomStore, type NewColumn, type ColumnPatch } from '@/lib/datasource/customStore';

export const dynamic = 'force-dynamic';
const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

async function body<T>(request: Request): Promise<T | null> {
  try { return (await request.json()) as T; } catch { return null; }
}
function guard(base: unknown): string | Response {
  const id = String(base ?? '');
  if (!id || BUILTIN_IDS.has(id)) return Response.json({ error: 'В эту базу нельзя вносить изменения' }, { status: 400 });
  return id;
}

export async function POST(request: Request): Promise<Response> {
  const b = await body<{ base?: unknown; label?: unknown; type?: NewColumn['type']; filterable?: boolean }>(request);
  if (!b) return Response.json({ error: 'Некорректный запрос' }, { status: 400 });
  const id = guard(b.base); if (id instanceof Response) return id;
  const label = String(b.label ?? '').trim();
  if (!label) return Response.json({ error: 'Нужно название колонки' }, { status: 400 });
  const base = await getCustomStore().addColumn(id, { label, type: b.type, filterable: b.filterable });
  if (!base) return Response.json({ error: 'База не найдена' }, { status: 404 });
  return Response.json({ base });
}

export async function PATCH(request: Request): Promise<Response> {
  const b = await body<{ base?: unknown; key?: unknown; label?: string; type?: ColumnPatch['type']; filterable?: boolean }>(request);
  if (!b) return Response.json({ error: 'Некорректный запрос' }, { status: 400 });
  const id = guard(b.base); if (id instanceof Response) return id;
  const key = String(b.key ?? ''); if (!key) return Response.json({ error: 'Нужен key колонки' }, { status: 400 });
  const base = await getCustomStore().updateColumn(id, key, { label: b.label, type: b.type, filterable: b.filterable });
  if (!base) return Response.json({ error: 'База или колонка не найдена' }, { status: 404 });
  return Response.json({ base });
}

export async function DELETE(request: Request): Promise<Response> {
  const b = await body<{ base?: unknown; key?: unknown }>(request);
  if (!b) return Response.json({ error: 'Некорректный запрос' }, { status: 400 });
  const id = guard(b.base); if (id instanceof Response) return id;
  const key = String(b.key ?? ''); if (!key) return Response.json({ error: 'Нужен key колонки' }, { status: 400 });
  const base = await getCustomStore().deleteColumn(id, key);
  if (!base) return Response.json({ error: 'База не найдена' }, { status: 404 });
  return Response.json({ base });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- columns`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/columns/route.ts app/api/columns/route.test.ts
git commit -m "feat(api): /api/columns add/update/delete over the custom store"
```

---

### Task 2: Record delete/restore on `/api/records`

**Files:**
- Modify: `app/api/records/route.ts` (add `DELETE` + a `restore` action)
- Test: `app/api/records/route.test.ts` (extend)

**Interfaces:**
- Consumes: `getCustomStore().softDeleteRecords / restoreRecords`.
- Produces: `DELETE /api/records` body `{ base, ids: string[] }` → `{ deleted: number }`; restore via `DELETE` with `{ base, ids, restore: true }` → `{ restored: number }` (keeps one handler; the UI Bin view uses `restore:true`).

- [ ] **Step 1: Write the failing test**

```ts
// append to app/api/records/route.test.ts
import { DELETE } from './route';
import { getCustomStore } from '@/lib/datasource/customStore';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- records`
Expected: FAIL — `DELETE` not exported from the records route.

- [ ] **Step 3: Add the `DELETE` handler**

```ts
// app/api/records/route.ts (append)
export async function DELETE(request: Request): Promise<Response> {
  let body: { base?: unknown; ids?: unknown; restore?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Некорректный запрос' }, { status: 400 }); }
  const baseId = String(body?.base ?? '');
  const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  if (!baseId || BUILTIN_IDS.has(baseId) || !ids.length) {
    return Response.json({ error: 'Нельзя удалить эти строки' }, { status: 400 });
  }
  const store = getCustomStore();
  if (body?.restore === true) {
    const restored = await store.restoreRecords(baseId, ids);
    return Response.json({ restored });
  }
  const deleted = await store.softDeleteRecords(baseId, ids);
  return Response.json({ deleted });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- records`
Expected: PASS (new + existing records tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/records/route.ts app/api/records/route.test.ts
git commit -m "feat(api): DELETE /api/records soft-delete + restore rows"
```

---

### Task 3: Base rename/move/delete on `/api/bases`

**Files:**
- Modify: `app/api/bases/route.ts` (add `PATCH` + `DELETE`)
- Test: `app/api/bases/route.test.ts` (create)

**Interfaces:**
- Consumes: `getCustomStore().renameBase / moveBase / softDeleteBase / restoreBase`.
- Produces: `PATCH /api/bases` `{ id, name?, parent? }` → `{ base }`; `DELETE /api/bases` `{ id, restore? }` → `{ deleted: id }` / `{ restored: id }`.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/bases/route.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bases`
Expected: FAIL — `PATCH`/`DELETE` not exported.

- [ ] **Step 3: Add the handlers to `app/api/bases/route.ts`**

```ts
// add near the top if not present:
import { BASES } from '@/lib/datasource/bases';
const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

export async function PATCH(request: Request): Promise<Response> {
  let body: { id?: unknown; name?: unknown; parent?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Некорректный запрос' }, { status: 400 }); }
  const id = String(body?.id ?? '');
  if (!id || BUILTIN_IDS.has(id)) return Response.json({ error: 'Эту базу нельзя менять' }, { status: 400 });
  const store = getCustomStore();
  let base = null;
  if (typeof body?.name === 'string' && body.name.trim()) base = await store.renameBase(id, body.name.trim());
  if (body?.parent !== undefined) base = await store.moveBase(id, body.parent === null ? null : String(body.parent));
  if (!base) return Response.json({ error: 'База не найдена' }, { status: 404 });
  return Response.json({ base });
}

export async function DELETE(request: Request): Promise<Response> {
  let body: { id?: unknown; restore?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Некорректный запрос' }, { status: 400 }); }
  const id = String(body?.id ?? '');
  if (!id || BUILTIN_IDS.has(id)) return Response.json({ error: 'Эту базу нельзя удалить' }, { status: 400 });
  const store = getCustomStore();
  if (body?.restore === true) { const okr = await store.restoreBase(id); return Response.json({ restored: okr ? id : null }); }
  const okd = await store.softDeleteBase(id);
  return Response.json({ deleted: okd ? id : null });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bases`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/bases/route.ts app/api/bases/route.test.ts
git commit -m "feat(api): PATCH/DELETE /api/bases rename/move/soft-delete/restore"
```

---

### Task 4: Bin routes — `/api/bin`

**Files:**
- Create: `app/api/bin/route.ts`
- Test: `app/api/bin/route.test.ts`

**Interfaces:**
- Consumes: `getCustomStore().listBin / emptyBin`; restore is handled by the records/bases routes (Tasks 2–3), so `/api/bin` covers `GET` (list) and `DELETE` (empty, confirm-gated).
- Produces: `GET /api/bin` → `BinContents`; `DELETE /api/bin` `{ confirm?: boolean, baseId?: string }` → dry-run `{ dryRun, wouldDelete }` or `{ emptied, bases, records }`.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/bin/route.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bin`
Expected: FAIL — `./route` has no exports.

- [ ] **Step 3: Implement the route**

```ts
// app/api/bin/route.ts
import { getCustomStore } from '@/lib/datasource/customStore';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const bin = await getCustomStore().listBin();
  return Response.json(bin);
}

export async function DELETE(request: Request): Promise<Response> {
  let body: { confirm?: unknown; baseId?: unknown } = {};
  try { body = await request.json(); } catch { /* empty body = dry-run all */ }
  const store = getCustomStore();
  const scope = typeof body?.baseId === 'string' && body.baseId ? { baseId: body.baseId } : undefined;
  if (body?.confirm !== true) {
    const bin = await store.listBin();
    const bases = scope ? bin.bases.filter((b) => b.id === scope.baseId) : bin.bases;
    const records = scope ? bin.records.filter((r) => r.baseId === scope.baseId) : bin.records;
    return Response.json({ dryRun: true, wouldDelete: { bases: bases.map((b) => b.name), baseCount: bases.length, records: records.length } });
  }
  const res = await store.emptyBin(scope);
  return Response.json({ emptied: true, ...res });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/bin/route.ts app/api/bin/route.test.ts
git commit -m "feat(api): /api/bin list + empty (confirm-gated dry-run)"
```

---

### Task 5: Phase gate — full API suite

**Files:**
- Test: whole repo.

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: all green — new `columns`, `bin`, extended `records`/`bases` tests + everything from Phase 0.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit any touch-ups**

```bash
git add -A && git commit -m "test(api): phase-2 web API green" || echo "nothing to commit"
```

## Self-Review

- **Spec coverage:** column CRUD (§5.3) → `/api/columns`; row delete/restore → `/api/records DELETE`; base rename/move/delete/restore → `/api/bases PATCH/DELETE`; bin list + confirm-gated empty (§5.2) → `/api/bin`. Builtin guards on every mutation (§5.5). ✓
- **Placeholders:** none — full handler code + tests.
- **Type consistency:** routes call the exact Phase 0 method names (`softDeleteRecords`, `restoreRecords`, `softDeleteBase`, `restoreBase`, `renameBase`, `moveBase`, `addColumn`, `updateColumn`, `deleteColumn`, `listBin`, `emptyBin`); `NewColumn`/`ColumnPatch` imported from the store. Dry-run/confirmed shapes match Phase 1's for a consistent client contract. ✓
