# Research → Save to Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "save to base" step that turns a research report's found companies into rows in a new or existing custom base.

**Architecture:** A pure mapping module (`lib/research/saveReport.ts`) dedups the report's companies into rows; a thin route (`app/api/research/save/route.ts`) writes them via the existing `customStore`; the research page gets a save panel. Reuses the already-built research engine and `customStore` — no new infra.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase (via existing `customStore`).

## Global Constraints

- Tests run with `npm test` (Vitest) from repo root `C:\Users\nehoc\ai-researcher`; route/unit tests use the in-memory `MemoryCustomStore` (default when `DATA_SOURCE !== 'supabase'`). No live Supabase needed.
- Builtin base ids `market / ai / it / workforce` (`BUILTIN_IDS = new Set(BASES.map(b => b.id))`) are read-only — the save route rejects them with HTTP 400.
- Rows dedup by **lowercased `name`**; when appending to an existing base, skip names already present and report the skipped count.
- Never invent rows: a subtopic with no `relevant` companies contributes nothing.
- Row `status` = `новое` when the company's report id starts with `web:`, else `в каталоге`. When a company appears both ways across subtopics, `в каталоге` wins.
- Column types come from `ColumnDef` (`lib/datasource/types.ts`): `'text' | 'number' | 'long-text' | 'url' | 'select'`.
- Scoped commits per task; never `git add -A` (untracked scratch/node_modules present).

---

### Task 1: Shared types + pure `reportToRows` mapping

**Files:**
- Create: `lib/research/types.ts`, `lib/research/saveReport.ts`
- Test: `lib/research/saveReport.test.ts`

**Interfaces:**
- Consumes: `ColumnDef` from `@/lib/datasource/types`.
- Produces:
  - `lib/research/types.ts`: `RelevantCompany` = `{ id: string; name: string; verdict: string | null; vertical: string | null; url: string | null }`; `Finding` = `{ subtopic: string; summary: string; findings: string[]; relevant: RelevantCompany[]; sources: { title: string; url: string }[]; source: 'mock' | 'web' }`.
  - `lib/research/saveReport.ts`: `REPORT_COLUMNS: ColumnDef[]`; `ReportRow` = `{ name: string; what: string; url: string; subtopic: string; status: string; sources: string }`; `reportToRows(report: Finding[]): ReportRow[]`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/research/saveReport.test.ts
import { describe, it, expect } from 'vitest';
import { reportToRows, REPORT_COLUMNS } from './saveReport';
import type { Finding } from './types';

const f = (subtopic: string, relevant: Finding['relevant'], sources: Finding['sources'] = []): Finding =>
  ({ subtopic, summary: '', findings: [], relevant, sources, source: 'web' });

describe('reportToRows', () => {
  it('maps relevant companies to rows with source urls', () => {
    const rows = reportToRows([
      f('Игроки', [{ id: 'heygen', name: 'HeyGen', verdict: null, vertical: 'video', url: 'https://heygen.com' }],
        [{ title: 'a', url: 'https://src1.com' }]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'HeyGen', what: 'video', url: 'https://heygen.com', subtopic: 'Игроки', status: 'в каталоге' });
    expect(rows[0].sources).toContain('https://src1.com');
  });

  it('dedups the same company across subtopics, merging subtopics and sources', () => {
    const c = { id: 'web:Foo', name: 'Foo', verdict: null, vertical: 'x', url: 'https://foo.com' };
    const rows = reportToRows([
      f('A', [c], [{ title: '1', url: 'https://s1.com' }]),
      f('B', [c], [{ title: '2', url: 'https://s2.com' }]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].subtopic).toBe('A, B');
    expect(rows[0].sources).toContain('https://s1.com');
    expect(rows[0].sources).toContain('https://s2.com');
    expect(rows[0].status).toBe('новое'); // web: id, never in catalog
  });

  it('prefers "в каталоге" when a company appears both ways', () => {
    const rows = reportToRows([
      f('A', [{ id: 'web:Bar', name: 'Bar', verdict: null, vertical: null, url: null }]),
      f('B', [{ id: 'bar', name: 'Bar', verdict: null, vertical: null, url: null }]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('в каталоге');
  });

  it('invents nothing for empty relevant, and skips nameless entries', () => {
    expect(reportToRows([f('A', [])])).toEqual([]);
    expect(reportToRows([f('A', [{ id: 'x', name: '  ', verdict: null, vertical: null, url: null }])])).toEqual([]);
  });

  it('exposes six columns with stable keys', () => {
    expect(REPORT_COLUMNS.map((c) => c.key)).toEqual(['name', 'what', 'url', 'subtopic', 'status', 'sources']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- saveReport`
Expected: FAIL — `./saveReport` and `./types` don't exist.

- [ ] **Step 3: Create `lib/research/types.ts`**

```ts
export interface RelevantCompany {
  id: string;
  name: string;
  verdict: string | null;
  vertical: string | null;
  url: string | null;
}
export interface Finding {
  subtopic: string;
  summary: string;
  findings: string[];
  relevant: RelevantCompany[];
  sources: { title: string; url: string }[];
  source: 'mock' | 'web';
}
```

- [ ] **Step 4: Create `lib/research/saveReport.ts`**

```ts
import type { ColumnDef } from '@/lib/datasource/types';
import type { Finding } from './types';

export const REPORT_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Название', type: 'text', sortable: true },
  { key: 'what', label: 'Что делает', type: 'text', sortable: true },
  { key: 'url', label: 'Ссылка', type: 'url' },
  { key: 'subtopic', label: 'Подтема', type: 'select', sortable: true, filterable: true },
  { key: 'status', label: 'Статус', type: 'select', sortable: true, filterable: true },
  { key: 'sources', label: 'Источники', type: 'long-text' },
];

export interface ReportRow {
  name: string; what: string; url: string; subtopic: string; status: string; sources: string;
}

// найденные компании по всем подтемам → строки, дедуп по имени (в нижнем
// регистре). Одна компания из разных подтем сливается: подтемы и источники
// объединяются; «в каталоге» приоритетнее «новое».
export function reportToRows(report: Finding[]): ReportRow[] {
  const acc = new Map<string, { row: ReportRow; subs: Set<string>; srcs: Set<string> }>();
  for (const f of report ?? []) {
    const subSources = (f.sources ?? []).map((s) => s.url).filter((u): u is string => Boolean(u));
    for (const c of f.relevant ?? []) {
      const name = String(c?.name ?? '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const status = String(c.id ?? '').startsWith('web:') ? 'новое' : 'в каталоге';
      let e = acc.get(key);
      if (!e) {
        e = { row: { name, what: c.vertical ?? '', url: c.url ?? '', subtopic: '', status, sources: '' }, subs: new Set(), srcs: new Set() };
        acc.set(key, e);
      } else {
        if (!e.row.what && c.vertical) e.row.what = c.vertical;
        if (!e.row.url && c.url) e.row.url = c.url;
        if (status === 'в каталоге') e.row.status = 'в каталоге';
      }
      e.subs.add(f.subtopic);
      for (const u of subSources) e.srcs.add(u);
    }
  }
  return [...acc.values()].map((e) => ({ ...e.row, subtopic: [...e.subs].join(', '), sources: [...e.srcs].join('\n') }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- saveReport`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/research/types.ts lib/research/saveReport.ts lib/research/saveReport.test.ts
git commit -m "feat(research): reportToRows mapping + REPORT_COLUMNS (dedup by name)"
```

---

### Task 2: `POST /api/research/save` route

**Files:**
- Create: `app/api/research/save/route.ts`
- Test: `app/api/research/save/route.test.ts`

**Interfaces:**
- Consumes: `reportToRows`, `REPORT_COLUMNS` from `@/lib/research/saveReport`; `Finding` from `@/lib/research/types`; `getCustomStore` from `@/lib/datasource/customStore`; `BASES` from `@/lib/datasource/bases`.
- Produces: `POST` handler. Body `{ report: Finding[], target: { mode: 'new', name: string } | { mode: 'existing', baseId: string } }` → `{ baseId, baseName, added, skipped }` or `{ error }`.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/research/save/route.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- research/save`
Expected: FAIL — `./route` has no exports.

- [ ] **Step 3: Implement the route**

```ts
// app/api/research/save/route.ts
import { getCustomStore } from '@/lib/datasource/customStore';
import { BASES } from '@/lib/datasource/bases';
import { reportToRows, REPORT_COLUMNS } from '@/lib/research/saveReport';
import type { Finding } from '@/lib/research/types';

export const dynamic = 'force-dynamic';
const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

export async function POST(request: Request): Promise<Response> {
  let body: { report?: unknown; target?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Некорректный запрос' }, { status: 400 }); }

  const report = Array.isArray(body?.report) ? (body.report as Finding[]) : [];
  const rows = reportToRows(report);
  if (!rows.length) return Response.json({ error: 'В отчёте нет компаний для сохранения' }, { status: 400 });

  const target = body?.target as { mode?: unknown; name?: unknown; baseId?: unknown } | undefined;
  const store = getCustomStore();

  try {
    if (target?.mode === 'new') {
      const name = String(target?.name ?? '').trim();
      if (!name) return Response.json({ error: 'Нужно название базы' }, { status: 400 });
      const base = await store.createBase({ name, columns: REPORT_COLUMNS });
      const added = await store.addRecords(base.id, rows as unknown as Record<string, unknown>[]);
      return Response.json({ baseId: base.id, baseName: base.name, added, skipped: 0 });
    }

    if (target?.mode === 'existing') {
      const baseId = String(target?.baseId ?? '');
      if (!baseId || BUILTIN_IDS.has(baseId)) return Response.json({ error: 'В эту базу нельзя сохранять' }, { status: 400 });
      const base = await store.getBase(baseId);
      if (!base) return Response.json({ error: 'База не найдена' }, { status: 404 });
      const have = new Set((await store.listRecords(baseId)).map((r) => String(r.name ?? '').toLowerCase()));
      const keys = new Set(base.columns.map((c) => c.key));
      const fresh = rows.filter((r) => !have.has(r.name.toLowerCase()));
      // сохраняем только колонки, которые есть в целевой базе
      const mapped = fresh.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => keys.has(k))));
      const added = mapped.length ? await store.addRecords(baseId, mapped as Record<string, unknown>[]) : 0;
      return Response.json({ baseId, baseName: base.name, added, skipped: rows.length - fresh.length });
    }

    return Response.json({ error: 'Не указана цель сохранения' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка сохранения';
    return Response.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- research/save`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/research/save/route.ts app/api/research/save/route.test.ts
git commit -m "feat(api): /api/research/save writes report rows to new/existing base"
```

---

### Task 3: Save panel in the research page

**Files:**
- Modify: `app/research/page.tsx`, `app/research/research.module.css`
- Test: manual (browser preview) — thin fetch wiring.

**Interfaces:**
- Consumes: `POST /api/research/save`; `GET /api/bases` (already returns `{ bases: {id,name,builtin,...}[] }`).
- Produces: a save panel shown once `report` exists and has companies.

- [ ] **Step 1: Add save state + handler (after the existing `runResearch`, near line 127 in `app/research/page.tsx`)**

```tsx
  // ── сохранение отчёта в базу ──
  const [saveMode, setSaveMode] = useState<'new' | 'existing'>('new');
  const [newName, setNewName] = useState('');
  const [targetBase, setTargetBase] = useState('');
  const [customBases, setCustomBases] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ baseId: string; baseName: string; added: number; skipped: number } | null>(null);

  const totalCompanies = (report ?? []).reduce((n, f) => n + f.relevant.length, 0);

  const openSave = () => {
    setNewName(prompt.trim().slice(0, 40) || 'Исследование');
    setSaved(null);
    fetch('/api/bases').then((r) => r.json()).then((b) => {
      setCustomBases((b.bases ?? []).filter((x: { builtin: boolean }) => !x.builtin).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
    }).catch(() => setCustomBases([]));
  };

  const saveToBase = async () => {
    const target = saveMode === 'new'
      ? { mode: 'new' as const, name: newName.trim() }
      : { mode: 'existing' as const, baseId: targetBase };
    if (saveMode === 'new' ? !newName.trim() : !targetBase) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/research/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report, target }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Ошибка сохранения');
      setSaved(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 2: Render the panel — inside the `{report && (…)}` block, just before its `planActions` (around line 398)**

```tsx
            {totalCompanies > 0 && !saved && (
              <div className={styles.saveBox}>
                <div className={styles.saveTitle}>Сохранить найденные компании в базу ({totalCompanies})</div>
                <label className={styles.saveRow}>
                  <input type="radio" checked={saveMode === 'new'} onChange={() => setSaveMode('new')} />
                  Новая база:
                  <input className={styles.saveInput} value={newName} onChange={(e) => setNewName(e.target.value)}
                    disabled={saveMode !== 'new'} placeholder="Название базы" />
                </label>
                <label className={styles.saveRow}>
                  <input type="radio" checked={saveMode === 'existing'} onChange={() => setSaveMode('existing')} />
                  В существующую:
                  <select className={styles.saveInput} value={targetBase} onChange={(e) => setTargetBase(e.target.value)}
                    disabled={saveMode !== 'existing'}>
                    <option value="">— выбрать —</option>
                    {customBases.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <button type="button" className={styles.primary} onClick={saveToBase}
                  disabled={saving || (saveMode === 'new' ? !newName.trim() : !targetBase)}>
                  {saving ? 'Сохраняю…' : 'Сохранить в базу'}
                </button>
              </div>
            )}
            {saved && (
              <p className={styles.savedLine}>
                ✅ Сохранено {saved.added} в «{saved.baseName}»{saved.skipped ? ` (пропущено дублей: ${saved.skipped})` : ''}.{' '}
                <Link href={`/?base=${encodeURIComponent(saved.baseId)}`} className={styles.savedLink}>Открыть базу →</Link>
              </p>
            )}
```

- [ ] **Step 3: Call `openSave()` when the report arrives** — in `runResearch`, right after `setReport(body.report ?? [])`, add:

```tsx
      if ((body.report ?? []).length) openSave();
```

- [ ] **Step 4: Add minimal CSS to `app/research/research.module.css`**

```css
.saveBox { margin-top: 20px; padding: 16px; border: 1px solid rgba(0,0,0,.12); border-radius: 10px; display: grid; gap: 10px; }
.saveTitle { font-weight: 600; }
.saveRow { display: flex; align-items: center; gap: 8px; }
.saveInput { flex: 1; padding: 6px 8px; border: 1px solid rgba(0,0,0,.15); border-radius: 6px; }
.savedLine { margin-top: 16px; }
.savedLink { text-decoration: underline; }
```

- [ ] **Step 5: Verify in the browser**

Start the dev server via `preview_start`; run a research (mock mode is fine without a key), then use the panel to save to a new base and confirm the success line + that the base opens with the rows. Check `read_network_requests` for `/api/research/save` → 200. (App is behind Google OAuth — if sign-in blocks the preview, verify via the route tests instead and note it.)

- [ ] **Step 6: Commit**

```bash
git add app/research/page.tsx app/research/research.module.css
git commit -m "feat(ui): save research report to a new or existing base"
```

---

### Task 4: Phase gate

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all green (new `saveReport` + `research/save` tests included), no type errors.

- [ ] **Step 2: Commit any touch-ups**

```bash
git add -A && git commit -m "test(research): save-to-base green" || echo "nothing to commit"
```

## Self-Review

- **Spec coverage:** save action (Task 3) ✓; new/existing target with dedup (Tasks 2–3, §5.2) ✓; six columns incl. sources (Task 1, §4) ✓; invents nothing on empty (Task 1 test) ✓; builtin rejection + empty-report rejection (Task 2) ✓; `OPENROUTER_API_KEY` is runtime-only, not needed to build (§9) ✓. Enrichment/MCP correctly out of scope. ✓
- **Placeholders:** none — full code + tests.
- **Type consistency:** `Finding`/`RelevantCompany` defined in Task 1 `lib/research/types.ts`, consumed verbatim by Tasks 2–3; `ReportRow`/`REPORT_COLUMNS`/`reportToRows` names identical across tasks; route response `{ baseId, baseName, added, skipped }` matches what Task 3's UI reads. ✓
- **Note:** Task 3 references the existing `report`, `prompt`, `error`, `setError`, `Link`, `styles`, `useState` already present in `app/research/page.tsx` — the implementer must integrate, not duplicate, the component's existing state.
