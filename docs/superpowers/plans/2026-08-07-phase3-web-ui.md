# Phase 3 — Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CRUD parity + the recycle bin visible and clickable in the showcase: delete rows in the grid, manage columns from a panel, rename/delete/reparent bases in the picker, and a Bin view to restore or permanently empty.

**Architecture:** Keep changes to the shared `@aivocado/mindsheet` package minimal and opt-in (one new `onDeleteRow` prop) so the Fathom dashboard that also consumes it is unaffected. Column management is an **app-level panel** (`app/manage-columns.tsx`), not a change to the grid's header rendering. Base actions live in the existing `app/base-tree.tsx`. A new `app/bin/page.tsx` route hosts the recycle bin. All UI calls the Phase 2 routes.

**Tech Stack:** Next.js App Router (client components), React 19, TypeScript, the `@aivocado/mindsheet` package (Vitest for its component tests), the in-app Browser preview for smoke checks.

## Global Constraints

- Depends on **Phase 2** endpoints: `POST/PATCH/DELETE /api/columns`, `DELETE /api/records` (`{base, ids, restore?}`), `PATCH/DELETE /api/bases` (`{id, name?, parent?, restore?}`), `GET/DELETE /api/bin`.
- MindSheet changes are **opt-in via new optional props**; when the prop is absent, rendering is identical to today (Fathom safety).
- Only custom bases are mutable; builtin bases (`market/ai/it/workforce`) show no delete/column/rename controls. `isCustom = !BUILTIN_IDS.has(base)` already exists in `app/page.tsx`.
- Destructive UI confirms before acting: row delete asks inline; base delete confirms; **empty-bin** requires an explicit confirm step in the Bin view (matches the API's confirm-gate).
- Follow existing styling: CSS modules next to each component (`*.module.css`), Russian UI copy matching the app's voice.
- The dev server launches via the project's normal command; use `preview_start` (never Bash) for browser verification.

---

### Task 1: MindSheet — opt-in `onDeleteRow`

**Files:**
- Modify: `node_modules/@aivocado/mindsheet/types.ts` (props), `node_modules/@aivocado/mindsheet/MindSheet.tsx` (render), `node_modules/@aivocado/mindsheet/MindSheet.module.css` (control style)
- Test: `node_modules/@aivocado/mindsheet/MindSheet.test.tsx` (extend)

> This is a workspace package (source in `node_modules`, `private: true`). Edit it in place; it is symlinked/vendored, not published.

**Interfaces:**
- Consumes: existing row rendering, the `canFavorite`/lead-cell pattern (MindSheet.tsx ~lines 941–957 render a per-row star in a lead cell).
- Produces: new optional prop `onDeleteRow?: (record: Row) => void`. When set (and `editable`), each data row shows a delete control in the lead area; clicking it calls `onDeleteRow(record)`.

- [ ] **Step 1: Write the failing test**

```tsx
// append to MindSheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MindSheet } from './index';

it('calls onDeleteRow when the row delete control is clicked', () => {
  const onDeleteRow = vi.fn();
  render(
    <MindSheet
      columns={[{ key: 'name', label: 'N', type: 'text' }]}
      records={[{ id: 'r1', name: 'Alpha' }]}
      editable
      onDeleteRow={onDeleteRow}
      onSortChange={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /удалить строку/i }));
  expect(onDeleteRow).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root): `npm test -- MindSheet`
Expected: FAIL — no delete control / `onDeleteRow` not a prop.

- [ ] **Step 3: Add the prop to `types.ts`**

In `MindSheetProps` (after `onAddRow`):

```ts
  /** удалить строку: показывает контрол удаления в строке (только в editable) */
  onDeleteRow?: (record: Row) => void;
```

- [ ] **Step 4: Render the control**

In `MindSheet.tsx`:
1. Destructure `onDeleteRow` in the props list (the block near line 106).
2. In the row renderer, right after the `canFavorite` lead cell (after line 957), add — gated so absent prop = no change:

```tsx
        {editable && onDeleteRow && (
          <div className={styles.caretCell}>
            <button
              type="button"
              className={styles.rowDelete}
              title="Удалить строку"
              aria-label="Удалить строку"
              onClick={(e) => { e.stopPropagation(); onDeleteRow(r); }}
              onKeyDown={(e) => e.stopPropagation()}
            >
              🗑
            </button>
          </div>
        )}
```

3. The lead column count must include this control so the grid columns line up. Find the `lead` / `leadCount` computations (lines ~247, ~330, ~335) and add `+ (editable && onDeleteRow ? 1 : 0)` everywhere the favorite/caret lead is counted. Grep for `canFavorite ? 1 : 0` and mirror the same additive term.

- [ ] **Step 5: Add minimal styling**

In `MindSheet.module.css`, add:

```css
.rowDelete { border: 0; background: none; cursor: pointer; opacity: .45; font-size: 12px; line-height: 1; }
.rowDelete:hover { opacity: 1; }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- MindSheet`
Expected: PASS. Also run the full package test to confirm no layout regression in existing tests: `npm test -- MindSheet`.

- [ ] **Step 7: Commit**

```bash
git add "node_modules/@aivocado/mindsheet/types.ts" "node_modules/@aivocado/mindsheet/MindSheet.tsx" "node_modules/@aivocado/mindsheet/MindSheet.module.css" "node_modules/@aivocado/mindsheet/MindSheet.test.tsx"
git commit -m "feat(mindsheet): opt-in onDeleteRow row control (no change when prop absent)"
```

> If `node_modules/@aivocado/mindsheet` is git-ignored, the package is instead maintained in its own repo/worktree — in that case apply the same edits there and rebuild. Confirm with `git check-ignore node_modules/@aivocado/mindsheet` before committing; if ignored, raise it rather than force-adding.

---

### Task 2: Wire row delete in `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`
- Test: manual (browser preview) — logic is a thin fetch mirroring existing `onAddRow`.

**Interfaces:**
- Consumes: MindSheet `onDeleteRow`; `DELETE /api/records`.
- Produces: `onDeleteRow` handler on the sheet; refreshes via `setRefreshTick`.

- [ ] **Step 1: Add the handler (mirror `onAddRow`, near line 73)**

```tsx
  const onDeleteRow = useCallback(
    (record: CatalogRecord) => {
      if (!window.confirm('Удалить строку в корзину? Её можно вернуть из корзины.')) return;
      fetch('/api/records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base, ids: [String(record.id)] }),
      }).then(() => setRefreshTick((t) => t + 1));
    },
    [base],
  );
```

- [ ] **Step 2: Pass it to the sheet (only for custom bases)**

In the `<MindSheet ... />` props (near line 303), add:

```tsx
            onDeleteRow={isCustom ? onDeleteRow : undefined}
```

- [ ] **Step 3: Verify in the browser**

Start the dev server with `preview_start` (project dev config), open a custom base, delete a row, confirm it disappears and the row count drops. Check `read_console_messages` for errors and `read_network_requests` for a `DELETE /api/records` → 200.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(ui): delete a row to the bin from the grid"
```

---

> **⚠️ SUPERSEDED (2026-08-07):** Task 3 below is **dropped**. Column management is already built **in-grid** in the `@aivocado/mindsheet` package (inline rename, retype, delete, drag-reorder, add-column track) and wired in `app/page.tsx` (committed `0a328b5`). Do **not** build the `ManageColumns` side-panel. Also note: **Task 1's `onDeleteRow` must layer onto the already-modified MindSheet** (which now has `editableColumns`/`onColumn*` props and a reworked header) — read the current `MindSheet.tsx` before editing.

### Task 3: Column manager panel — ❌ SUPERSEDED, DO NOT IMPLEMENT

**Files:**
- Create: `app/manage-columns.tsx`, `app/manage-columns.module.css`
- Modify: `app/page.tsx` (button to open it + refresh columns after changes)
- Test: manual (browser preview).

**Interfaces:**
- Consumes: `GET /api/records?base=…` already returns `columns`; `POST/PATCH/DELETE /api/columns`.
- Produces: `<ManageColumns base={base} columns={columns} onChanged={() => setRefreshTick(t=>t+1)} onClose={…} />`.

- [ ] **Step 1: Create the panel component**

```tsx
// app/manage-columns.tsx
'use client';
import { useState } from 'react';
import type { ColumnDef, ColumnType } from '@/lib/datasource/types';
import styles from './manage-columns.module.css';

const TYPES: ColumnType[] = ['text', 'number', 'select', 'url', 'long-text'];

export default function ManageColumns({
  base, columns, onChanged, onClose,
}: { base: string; columns: ColumnDef[]; onChanged: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<ColumnType>('text');

  async function call(method: string, body: unknown) {
    setBusy(true);
    try {
      const r = await fetch('/api/columns', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) alert((await r.json()).error ?? 'Ошибка'); else onChanged();
    } finally { setBusy(false); }
  }

  return (
    <div className={styles.panel} role="dialog" aria-label="Колонки базы">
      <div className={styles.head}><span>Колонки</span><button onClick={onClose} aria-label="Закрыть">×</button></div>
      <ul className={styles.list}>
        {columns.map((c) => (
          <li key={c.key} className={styles.item}>
            <input defaultValue={c.label} disabled={busy} onBlur={(e) => e.target.value.trim() && e.target.value !== c.label && call('PATCH', { base, key: c.key, label: e.target.value.trim() })} />
            <select defaultValue={c.type} disabled={busy} onChange={(e) => call('PATCH', { base, key: c.key, type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className={styles.del} disabled={busy} title="Удалить колонку (данные строк сохранятся)"
              onClick={() => window.confirm(`Удалить колонку «${c.label}»? Значения останутся в данных и вернутся, если добавить колонку с тем же ключом.`) && call('DELETE', { base, key: c.key })}>🗑</button>
          </li>
        ))}
      </ul>
      <div className={styles.add}>
        <input placeholder="Новая колонка…" value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy} />
        <select value={type} onChange={(e) => setType(e.target.value as ColumnType)} disabled={busy}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button disabled={busy || !label.trim()} onClick={() => { call('POST', { base, label: label.trim(), type }); setLabel(''); }}>Добавить</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add minimal CSS**

```css
/* app/manage-columns.module.css */
.panel { position: absolute; z-index: 40; right: 16px; top: 56px; width: 320px; background: var(--surface, #fff); border: 1px solid rgba(0,0,0,.12); border-radius: 10px; padding: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.15); }
.head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 8px; }
.list { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow: auto; }
.item { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center; padding: 4px 0; }
.item input, .add input, .item select, .add select { padding: 4px 6px; border: 1px solid rgba(0,0,0,.15); border-radius: 6px; }
.del { border: 0; background: none; cursor: pointer; opacity: .5; }
.del:hover { opacity: 1; }
.add { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; margin-top: 10px; border-top: 1px solid rgba(0,0,0,.08); padding-top: 10px; }
```

- [ ] **Step 3: Open it from `app/page.tsx`**

Add state `const [managingCols, setManagingCols] = useState(false);`. In `headerActions`, show a button only for custom bases:

```tsx
          {isCustom && <button type="button" className={styles.navLink} onClick={() => setManagingCols(true)}>⚙ Колонки</button>}
```

Render near the `creating` panel:

```tsx
        {managingCols && isCustom && (
          <ManageColumns base={base} columns={columns} onChanged={() => setRefreshTick((t) => t + 1)} onClose={() => setManagingCols(false)} />
        )}
```

Import `ManageColumns` at the top.

- [ ] **Step 4: Verify in the browser**

Add a column, rename one (blur), retype one, delete one; confirm the grid header updates and a deleted column's data returns if re-added with the same label. Watch network for `/api/columns` calls → 200.

- [ ] **Step 5: Commit**

```bash
git add app/manage-columns.tsx app/manage-columns.module.css app/page.tsx
git commit -m "feat(ui): column manager panel (add/rename/retype/delete)"
```

---

### Task 4: Bin view — `app/bin/page.tsx`

**Files:**
- Create: `app/bin/page.tsx`, `app/bin/bin.module.css`
- Modify: `app/page.tsx` (header link to `/bin`)
- Test: manual (browser preview).

**Interfaces:**
- Consumes: `GET /api/bin` → `{ bases: {id,name}[], records: {baseId,baseName,record}[] }`; restore via `DELETE /api/bases {id, restore:true}` and `DELETE /api/records {base, ids, restore:true}`; empty via `DELETE /api/bin {confirm?, baseId?}`.
- Produces: a page listing binned bases + rows with Restore per item and an Empty-bin action with confirm.

- [ ] **Step 1: Create the page**

```tsx
// app/bin/page.tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './bin.module.css';

interface Bin { bases: { id: string; name: string }[]; records: { baseId: string; baseName: string; record: { id: string; [k: string]: unknown } }[] }

export default function BinPage() {
  const [bin, setBin] = useState<Bin>({ bases: [], records: [] });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { fetch('/api/bin').then((r) => r.json()).then(setBin).catch(() => {}); }, []);
  useEffect(load, [load]);

  const restoreBase = async (id: string) => { await fetch('/api/bases', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, restore: true }) }); load(); };
  const restoreRow = async (base: string, id: string) => { await fetch('/api/records', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base, ids: [id], restore: true }) }); load(); };

  const empty = async () => {
    const preview = await (await fetch('/api/bin', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })).json();
    const n = preview?.wouldDelete;
    if (!window.confirm(`Очистить корзину безвозвратно? Будет удалено баз: ${n?.baseCount ?? 0}, строк: ${n?.records ?? 0}. Отменить нельзя.`)) return;
    setBusy(true);
    try { await fetch('/api/bin', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) }); load(); } finally { setBusy(false); }
  };

  const empty_ = bin.bases.length === 0 && bin.records.length === 0;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <Link href="/" className={styles.back}>← Базы</Link>
        <h1>Корзина</h1>
        <button className={styles.empty} onClick={empty} disabled={busy || empty_}>Очистить корзину</button>
      </header>

      {empty_ && <p className={styles.none}>Корзина пуста.</p>}

      {bin.bases.length > 0 && (
        <section><h2>Базы</h2><ul>
          {bin.bases.map((b) => (
            <li key={b.id}><span>{b.name}</span><button onClick={() => restoreBase(b.id)}>Восстановить</button></li>
          ))}
        </ul></section>
      )}

      {bin.records.length > 0 && (
        <section><h2>Строки</h2><ul>
          {bin.records.map((r) => (
            <li key={r.record.id}><span>{String(r.record.name ?? r.record['название'] ?? r.record.id)} <em>· {r.baseName}</em></span><button onClick={() => restoreRow(r.baseId, r.record.id)}>Восстановить</button></li>
          ))}
        </ul></section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS**

```css
/* app/bin/bin.module.css */
.wrap { max-width: 760px; margin: 0 auto; padding: 24px; }
.head { display: flex; align-items: center; gap: 16px; }
.head h1 { flex: 1; font-size: 20px; margin: 0; }
.back { color: inherit; text-decoration: none; opacity: .7; }
.empty { color: #b3261e; border: 1px solid #b3261e; background: none; border-radius: 8px; padding: 6px 12px; cursor: pointer; }
.empty:disabled { opacity: .4; cursor: default; }
.none { opacity: .6; margin-top: 32px; }
section { margin-top: 24px; }
section h2 { font-size: 14px; opacity: .7; }
section ul { list-style: none; padding: 0; margin: 8px 0 0; }
section li { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,.08); }
section li em { opacity: .55; font-style: normal; }
section button { border: 1px solid rgba(0,0,0,.2); background: none; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
```

- [ ] **Step 3: Link to the bin from the main header**

In `app/page.tsx` `headerActions`, add near the Sites link:

```tsx
          <Link href="/bin" className={styles.navLink}>🗑 Корзина</Link>
```

- [ ] **Step 4: Verify in the browser**

Delete a base and a row (Tasks 2–3), open `/bin`, restore each and confirm they reappear; delete again, Empty the bin, confirm the confirm-dialog shows correct counts and the items are gone. Watch network for the dry-run vs `confirm:true` calls.

- [ ] **Step 5: Commit**

```bash
git add app/bin/page.tsx app/bin/bin.module.css app/page.tsx
git commit -m "feat(ui): recycle-bin view with restore + confirm-gated empty"
```

---

### Task 5: Base rename / delete / reparent in the picker

**Files:**
- Modify: `app/base-tree.tsx`, `app/base-tree.module.css`
- Test: manual (browser preview).

**Interfaces:**
- Consumes: `PATCH /api/bases` (rename/move), `DELETE /api/bases` (soft-delete).
- Produces: per-custom-base row actions in the tree; a new `onMutated?: () => void` prop the picker/page passes to reload bases after a change.

- [ ] **Step 1: Thread an `onMutated` callback down**

In `app/base-tree.tsx` props, add `onMutated?: () => void`. In `app/base-picker.tsx`, add `onMutated?: () => void` to its props and pass it to `<BaseTree ... onMutated={onMutated} />`. In `app/page.tsx`, pass `onMutated={loadBases}` to `<BasePicker ... />`.

- [ ] **Step 2: Add row actions for non-builtin nodes**

In `renderNode` (after the node button, before closing the row `div` at line 131), for `!node.builtin` add:

```tsx
          <span className={styles.actions}>
            <button type="button" title="Переименовать" onClick={async (e) => {
              e.stopPropagation();
              const name = window.prompt('Новое название базы:', node.name);
              if (name && name.trim() && name.trim() !== node.name) {
                await fetch('/api/bases', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: node.id, name: name.trim() }) });
                onMutated?.();
              }
            }}>✏️</button>
            <button type="button" title="Удалить базу в корзину" onClick={async (e) => {
              e.stopPropagation();
              if (!window.confirm(`Удалить базу «${node.name}» в корзину? Её строки тоже уедут в корзину, вернуть можно оттуда.`)) return;
              await fetch('/api/bases', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: node.id }) });
              onMutated?.();
            }}>🗑</button>
          </span>
```

> Reparent (move) via drag-and-drop is out of scope for this task; renaming + delete cover the parity gap. `move_base` remains available through the API/MCP. If a lightweight reparent is wanted, add a "Переместить в…" prompt listing base ids — but only if requested, to avoid scope creep.

- [ ] **Step 3: Style the actions (hidden until row hover)**

```css
/* app/base-tree.module.css — append */
.actions { display: inline-flex; gap: 4px; margin-left: auto; opacity: 0; transition: opacity .1s; }
.row:hover .actions { opacity: .8; }
.actions button { border: 0; background: none; cursor: pointer; font-size: 12px; }
.actions button:hover { opacity: 1; }
```

(Ensure `.row` is `display: flex; align-items: center;` — if it isn't already, add it so `margin-left:auto` pushes actions right.)

- [ ] **Step 4: Verify in the browser**

Rename a custom base and confirm the crumb/label updates; delete one and confirm it vanishes from the tree and appears in `/bin`. Builtin bases must show no action buttons.

- [ ] **Step 5: Commit**

```bash
git add app/base-tree.tsx app/base-tree.module.css app/base-picker.tsx app/page.tsx
git commit -m "feat(ui): rename + delete custom bases from the picker"
```

---

### Task 6: Phase gate — end-to-end smoke + suite

**Files:**
- Test: browser preview + `npm test`.

- [ ] **Step 1: Full round-trip in the browser**

With the dev server running (`preview_start`): create a base → add columns → add rows → delete a row → delete a column → rename the base → delete the base → open `/bin` → restore the base → delete again → empty the bin (confirm counts). Capture a screenshot of the Bin view as proof.

- [ ] **Step 2: Run the test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all green (including the MindSheet `onDeleteRow` test), no type errors.

- [ ] **Step 3: Check console + network are clean**

Use `read_console_messages` (no errors) and `read_network_requests` (all `/api/*` calls 200) on the main flows.

- [ ] **Step 4: Commit any touch-ups**

```bash
git add -A && git commit -m "test(ui): phase-3 web UI end-to-end green" || echo "nothing to commit"
```

## Self-Review

- **Spec coverage:** row delete in grid (Task 1–2); column add/rename/retype/delete UI (Task 3, §5.3 copy tells the user data is retained); base rename + delete (Task 5); Bin view with restore + confirm-gated empty (Task 4, §5.2). Builtin bases show no controls (§5.5). MindSheet change is opt-in → Fathom unaffected. ✓
- **Placeholders:** none — full component code + CSS. Reparent-by-DnD explicitly deferred with rationale (not a silent gap; `move_base` exists in API/MCP).
- **Type consistency:** UI calls exactly the Phase 2 contracts — `DELETE /api/records {base, ids, restore?}`, `PATCH/DELETE /api/bases {id, name?, restore?}`, `/api/columns {base, key?, label?, type?}`, `/api/bin {confirm?, baseId?}` with `{wouldDelete:{baseCount,records}}`. `onDeleteRow(record)` matches the prop added to `MindSheetProps`. ✓
- **Open risk flagged:** Task 1 notes the git-ignore check for the vendored package before committing.
