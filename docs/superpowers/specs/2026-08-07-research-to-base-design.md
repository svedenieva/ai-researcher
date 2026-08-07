# Research → Save to Base — Design

**Date:** 2026-08-07
**Status:** Approved for planning
**Topic:** Persist a research report's found companies into a knowledge base (new or existing), instead of discarding it.

---

## 1. Problem

The research wizard (`app/research/page.tsx` + `/api/research/*`) already does the hard part: a topic is decomposed into subtopics, each is run through a **live web-search engine** (OpenRouter `web` plugin in `app/api/research/run/route.ts`), and the result is a report of found companies with real source citations. But the report is **terminal** — it renders on screen and is thrown away. The product's purpose ("research a topic → the base fills with real companies and primary sources") is unmet by exactly one missing step: **saving the report into a base.**

## 2. Goals

1. From the research report, a **"Save to base"** action that writes the found companies as rows.
2. Target is the user's choice: **a new base** (named from the topic) **or an existing custom base** (append, skipping duplicates).
3. Each row carries its **primary source** links.
4. Honest: if a subtopic found nothing, no rows are invented for it.

## 3. Non-Goals (YAGNI)

- **Per-row enrichment (idea B)** — refreshing an existing row's columns / generating deep_* fields. Separate follow-up spec.
- **An MCP "research-and-save" tool** — web-first; the MCP already has a `research-topic` prompt. Follow-up.
- **Saving the prose** (per-subtopic `summary`/`findings`) as rows — the rows are the actionable data; the prose stays in the on-screen report.
- **Providing/managing the `OPENROUTER_API_KEY`** — that's an env/ops action by the user (see §9). The feature works in mock mode too; it just saves catalog-derived rows then.

## 4. What Gets Saved

Input: the `Finding[]` report already produced by `/api/research/run` (shape in `run/route.ts`: `{ subtopic, summary, findings, relevant: RelevantCompany[], sources: {title,url}[], source }`).

Rows = the **`relevant` companies across all subtopics**, **deduped by lowercased name**. When the same company appears under multiple subtopics, merge: keep the first non-empty field values, and union the subtopics and source URLs.

**Columns of the target base** (created for a new base; for an existing base we map onto whatever columns exist by matching these keys, and skip unknown ones):

| key | label | type | filterable | source field |
|---|---|---|---|---|
| `name` | Название | text | – | company name |
| `what` | Что делает | text | – | `vertical` (or the model's "what") |
| `url` | Ссылка | url | – | company url |
| `subtopic` | Подтема | select | yes | subtopic(s) it was found under (joined) |
| `status` | Статус | select | yes | `в каталоге` if already in catalog (id not `web:`-prefixed) else `новое` |
| `sources` | Источники | long-text | – | the subtopic's source URLs (deduped, joined) |

## 5. Components

### 5.1 `lib/research/saveReport.ts` (pure, tested)
- `REPORT_COLUMNS: ColumnDef[]` — the six columns above.
- `reportToRows(report: Finding[]): Row[]` — dedup + merge logic → array of `{ name, what, url, subtopic, status, sources }` objects. No I/O. This is the unit-tested core.
- `Finding`/`RelevantCompany` types imported/shared with the run route (extract to `lib/research/types.ts` if not already shared, so route and page and this module agree).

### 5.2 `app/api/research/save/route.ts`
`POST` body: `{ report: Finding[], target: { mode: 'new', name: string } | { mode: 'existing', baseId: string } }`.
- Validates; rejects builtin base ids and empty report (400).
- `reportToRows(report)`.
- **new:** `getCustomStore().createBase({ name, columns: REPORT_COLUMNS })` then `addRecords(base.id, rows)`.
- **existing:** load base; **dedup against existing rows by lowercased `name`** (skip already-present); `addRecords(baseId, freshRows)`. Map row keys onto the base's actual column keys; drop keys the base doesn't have.
- Returns `{ baseId, baseName, added, skipped }`.

### 5.3 `app/research/page.tsx` (wire the step)
After the report renders, a **"Сохранить в базу"** panel:
- radio: «Новая база» (text input prefilled from `prompt`) / «В существующую» (a `<select>` populated from `GET /api/bases`, custom bases only).
- «Сохранить» → `POST /api/research/save` → success line: `Сохранено N компаний в «<base>» (пропущено M дублей)` with a link to `/?base=<id>`.
- Disabled/hidden when the report has zero companies; shows the mock-mode note already present.

## 6. Data Flow

```
report (client state) ─► user picks new|existing target ─► POST /api/research/save
   └► reportToRows(): dedup by name, merge subtopics+sources
   └► new: createBase(REPORT_COLUMNS) + addRecords
      existing: skip names already in base, addRecords(rest), map to base columns
   └► { baseId, added, skipped } ─► success + link to the base
```

## 7. Files

**New:** `lib/research/saveReport.ts`, `lib/research/saveReport.test.ts`, `app/api/research/save/route.ts`, `app/api/research/save/route.test.ts`. Possibly `lib/research/types.ts` (shared `Finding`/`RelevantCompany`).

**Modified:** `app/research/page.tsx` (+ its `.module.css`) — the save panel; `app/api/research/run/route.ts` (only if extracting shared types).

## 8. Testing

- **`saveReport.test.ts` (core):** dedup by name across subtopics; merge of subtopics + sources; `status` derivation (`web:`-id → «новое», else «в каталоге»); empty/absent `relevant` → no rows; field-coercion for the row objects.
- **`save/route.test.ts`:** new-base path creates a base with `REPORT_COLUMNS` and the rows; existing-base path skips duplicates by name and reports `skipped`; builtin id → 400; empty report → 400. Runs against `MemoryCustomStore`.
- Existing suite stays green; `npx tsc --noEmit` clean.
- Browser smoke deferred (app behind OAuth) — the route + unit tests carry it.

## 9. Dependency & Branch

- **`OPENROUTER_API_KEY`** (Vercel env) turns the research engine from mock → live web. **Not required to build or to save** — saving persists whatever the report contains. Flagged so real web results are understood to need the key + OpenRouter credits.
- **Branch `feature/research-to-base`**, cut from the deployed `feature/crud-parity-recycle-bin` tip.

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Dupes when appending to an existing base | Skip by lowercased `name`; report `skipped` count |
| Existing base's columns differ from REPORT_COLUMNS | Map by key, drop unknown keys; never fail on shape mismatch |
| Saving mock/catalog data as if researched | Row `status` + the on-screen mock-mode banner make the source explicit; sources column empty for catalog-only rows |
| Report has zero companies | Save action hidden/disabled; nothing invented |

## 11. Open Questions

None blocking. Follow-ups: per-row enrichment (idea B), an MCP research-and-save tool.
