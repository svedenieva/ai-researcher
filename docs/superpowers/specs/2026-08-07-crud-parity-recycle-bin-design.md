# CRUD Parity + Recycle Bin — Design

**Date:** 2026-08-07
**Status:** Approved for planning
**Topic:** Full create/read/update/delete parity for custom bases across the MCP connector and the web UI, backed by a soft-delete recycle bin.

---

## 1. Problem

The AI-Researcher showcase lets users keep "knowledge bases" — custom tables with their own columns and rows, stored in Supabase (`bases`, `base_records`) and browsed through the `MindSheet` grid. The product promise is that users can *"add databases, change databases, add rows and columns, and do the vice versa."*

Today only half of that is true:

- **No column management.** Columns are fixed at `create_base`. There is no add / rename / retype / delete column anywhere — not in the MCP, not in the web UI. Several existing bases are stuck with a single `name` column as a result.
- **No deletion at all.** There is no way to delete a base, delete rows, or remove a record — through either surface. The "vice versa" is impossible.
- **No safety net.** The MCP talks to Supabase with the service key (bypasses auth). Any delete we add is, by default, irreversible.
- **Two divergent code paths.** The MCP (`mcp/server.mjs`, raw Supabase) and the web app (`lib/datasource/customStore.ts`, typed store) both read/write the same tables independently. Any new capability must be reflected in both or the surfaces disagree.
- **Whole-table reads.** `query_records` / `catalog_search` load the entire `products` / `base_records` set into memory and filter in JS on every call. Fine at current scale (412 products), but the wrong shape as bases grow.

## 2. Goals

1. **CRUD parity** for custom bases on **both** surfaces (MCP + web UI): manage columns, delete/rename/reparent bases, delete rows.
2. **A real recycle bin.** Delete moves items to a bin; they can be restored; only an explicit "empty bin" permanently removes them. Deleted items disappear from every reader (web *and* MCP), not just one.
3. **Server-side filtering & pagination** for record/catalog reads, replacing whole-table scans.
4. **No regressions** — the showcase keeps working at every phase boundary.

## 3. Non-Goals (YAGNI)

- **Full-text search RPC / search index.** At 412 rows the in-memory scan is fine. Deferred until a base or the catalog outgrows it; noted as a future follow-up.
- **Per-user / permissioned bins.** The registry is already shared ("access = being logged in"); the bin follows the same model — one shared bin, no ownership gate.
- **Undo history / versioning of cell edits.** Out of scope; the bin covers row/base recovery only.
- **A bin for columns.** Unnecessary by construction (see §5.3): column edits never destroy cell data.

## 4. Architecture Overview

```
                    ┌────────────────────────┐
   SQL migration    │  bases.deleted_at       │
   (Phase 0)        │  base_records.deleted_at│
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┴───────────────────┐
              │        shared conceptual model       │
              │  soft-delete · restore · empty-bin   │
              │  column mutate · rename/move base    │
              └───────┬───────────────────┬──────────┘
                      │ (typed)           │ (raw, mirrored)
        customStore.ts│                   │mcp/server.mjs
                      │                   │
        ┌─────────────┴──────┐       ┌────┴───────────────┐
        │  web API routes    │       │   MCP tools        │  ← chat-driven
        │  (Phase 2)         │       │   (Phase 1)        │
        └─────────┬──────────┘       └────────────────────┘
                  │
        ┌─────────┴──────────┐
        │ web UI + MindSheet │  ← user-visible
        │ (Phase 3)          │
        └────────────────────┘
```

The two code paths (`customStore.ts` and `server.mjs`) stay separate — unifying them is a bigger refactor and out of scope — but they implement the **same rules**, documented here so they cannot drift. Reads on both sides gain a `deleted_at IS NULL` filter.

## 5. Design Rules (binding on both surfaces)

### 5.1 Delete is always soft
`delete_base`, `delete_rows`, `delete_record`, and the UI delete controls set `deleted_at = now()`. The row/base stays in the table but is invisible to every normal read. `restore` sets `deleted_at = NULL`.

### 5.2 Only `empty_bin` is destructive
`empty_bin` is the sole operation that issues a real SQL `DELETE`. It **requires `confirm: true`**; without it, it returns a dry-run preview (what would be removed, and counts) and does nothing. Emptying a base also removes its records.

### 5.3 Column key is immutable; column edits never destroy data
Columns live inside the `bases.columns` JSON array; each cell's value lives under its column **key** inside the record's `data` JSON.

- **add_column** appends a new `ColumnDef`.
- **rename column** changes the `label` only. The `key` never changes, so no cell data is ever orphaned.
- **retype column** changes `type` (and re-derives `filterable`) with best-effort coercion of *displayed* values (text→number parses; unparseable shows blank). The stored JSON is not rewritten destructively; a later retype-back recovers it.
- **delete_column** removes the def from the array. Cell values remain in each record's `data` under that key — re-adding a column with the same key brings the column back fully populated.

Because a column can always be reconstructed, columns need no bin.

### 5.4 Cascade semantics
Soft-deleting a base hides the base **and** its records from readers. It does **not** touch descendant (child) bases — those become top-level orphans in the tree (the web already handles missing parents by floating a base to the top level). Restoring a base restores only that base's own records.

### 5.5 Builtin bases stay read-only
`market / ai / it / workforce` are catalog slices. All destructive and schema tools reject them, exactly as `add_rows` / `update_record` already do.

## 6. Data Model Changes (Phase 0)

**Migration convention.** This repo has no numbered migrations — `supabase/schema.sql` is a single idempotent file applied by hand (Supabase → SQL Editor → Run). The `deleted_at` change is **appended to `supabase/schema.sql`** following that convention.

**Pre-existing gap to close.** `bases` and `base_records` are used by the app but their DDL is *not* in `schema.sql` today (they were created ad-hoc in the Supabase console). Phase 0 also adds their canonical `create table if not exists` so the file becomes authoritative — otherwise the migration references tables the repo never declares.

Migration (idempotent, appended to `supabase/schema.sql`):

```sql
-- canonical DDL for the two custom-base tables (previously console-only)
create table if not exists bases (
  id         text primary key,
  name       text not null,
  tone       text,
  columns    jsonb not null default '[]',
  parent     text,
  owner_email text,
  created_at timestamptz not null default now()
);
create table if not exists base_records (
  id         uuid primary key default gen_random_uuid(),
  base_id    text not null references bases(id),
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- recycle-bin marker
alter table bases        add column if not exists deleted_at timestamptz;
alter table base_records add column if not exists deleted_at timestamptz;
create index if not exists bases_deleted_at_idx        on bases (deleted_at);
create index if not exists base_records_deleted_at_idx on base_records (deleted_at);
```

> The `bases`/`base_records` column types above must be **verified against the live Supabase tables** before applying (Phase 0, step 1), since the ad-hoc originals are the source of truth — `create table if not exists` will no-op on the existing tables, so a mismatch would silently leave reality diverging from the file. Reconcile any differences into `schema.sql`.

`customStore.ts` and `server.mjs` reads add `.is('deleted_at', null)`. Both tolerate the column being absent (pre-migration) the same way they already tolerate a missing `parent` / `owner_email`: on a "column does not exist" error, fall back to the unfiltered read so the app degrades instead of breaking.

## 7. Phase Breakdown

Each phase leaves the app working and is independently reviewable. Within a phase, independent tasks are dispatched to parallel agents.

### Phase 0 — Foundation (DB + shared data layer)
- SQL migration (above), committed as a `.sql` file under the repo's migrations location.
- `customStore.ts`: add `softDeleteBase`, `restoreBase`, `softDeleteRecords`, `restoreRecords`, `listBin`, `emptyBin`, `renameBase`, `moveBase`, `addColumn`, `updateColumn`, `deleteColumn`. Reads filter `deleted_at IS NULL`.
- Unit tests against `MemoryCustomStore` for every new method (the store already has a dev in-memory backend; extend it to model `deleted_at`).
- **Ship state:** no user-visible change; existing tests green.

### Phase 1 — MCP tools + efficiency
New tools in `mcp/server.mjs`, mirroring the Phase 0 rules:
- `get_base` — full column defs (key, label, type, filterable) + row count.
- `add_column`, `update_column`, `delete_column`.
- `rename_base`, `move_base`, `delete_base`.
- `delete_rows` (by id list), `delete_record`.
- `list_bin`, `restore`, `empty_bin` (`confirm` gated).
- Rework `query_records` + `catalog_search`: `base_id` / `section` filter and `limit` / `offset` pushed into Supabase; return `total` + `hasMore`.
- Update the connector `INSTRUCTIONS` (`lib/mcp/instructions.mjs`) to describe the bin workflow and the new tools.
- **Ship state:** full CRUD + bin drivable from any MCP chat client.

### Phase 2 — Web API routes
Thin handlers over the Phase 0 store methods:
- `DELETE /api/records` (soft-delete rows), `POST /api/records/restore`.
- `PATCH /api/bases` (rename / move), `DELETE /api/bases` (soft-delete base).
- `/api/columns` — `POST` add, `PATCH` update, `DELETE` remove.
- `/api/bin` — `GET` list, `POST` restore, `DELETE` empty (confirm-gated).
- Route tests following the existing `app/api/records/route.test.ts` pattern.
- **Ship state:** API-complete; UI can be built against it.

### Phase 3 — Web UI
- **MindSheet** (`@aivocado/mindsheet`): add opt-in `onDeleteRow` (row hover/selection → delete control) and a **column-manager** affordance (header menu or a "Manage columns" panel) driving add/rename/retype/delete. Keep it opt-in so read-only hosts (e.g. Fathom) are unaffected; extend `MindSheetProps` and cover with the package's vitest suite.
- **Bin view:** a route/panel (e.g. `/bin` or a picker entry) listing binned bases & rows with Restore and Empty actions; empty asks for confirmation.
- **Base picker** (`app/base-picker.tsx` / `base-tree.tsx`): rename, delete, and reparent controls per custom base.
- **Ship state:** the whole feature is visible and clickable.

## 8. Testing Strategy

- **Phase 0:** unit tests on the in-memory store for soft-delete/restore/empty and each column mutation, asserting the §5 rules (esp. 5.3 data-retention and 5.2 confirm-gating).
- **Phase 1:** exercise MCP tools via `mcp/test-client.mjs` against a disposable base; assert deleted items vanish from `query_records` but appear in `list_bin`, and `empty_bin` without `confirm` is a no-op.
- **Phase 2:** route tests mirroring `route.test.ts`.
- **Phase 3:** MindSheet component tests for the new callbacks; a manual smoke pass in the browser preview for the Bin view and picker controls.
- **Cross-surface invariant:** a row deleted via the MCP must not appear in the web `/api/records` read, and vice-versa — the acceptance test for "the bin is honest."

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Migration not yet run in an environment | Both readers fall back to unfiltered read on missing-column error (§6); nothing crashes, bin just inert until migrated |
| MCP and web store drift apart | §5 rules are the single source of truth; each phase's tests assert them on both surfaces |
| MindSheet changes ripple to other hosts (Fathom) | All new grid behaviour is opt-in via new props; defaults preserve current read-only rendering |
| Accidental permanent loss | Only `empty_bin` deletes, and only with `confirm: true`; everything else is recoverable |
| Retype corrupts data | Coercion affects display only; stored JSON preserved (§5.3) |

## 10. Open Questions

None blocking. Deferred: full-text search RPC (§3), and whether "empty bin" should eventually require a typed base-name confirmation in the UI (Phase 3 can decide from the built experience).
