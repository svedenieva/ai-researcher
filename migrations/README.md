# Database migrations

Supabase has no migration runner wired into this project, and the service key we
hold only reaches PostgREST — it **cannot run `CREATE TABLE` / `ALTER TABLE`**.
So schema changes are applied **by hand in the Supabase SQL editor**. This folder
exists so that "the code shipped but the table doesn't exist" never happens
silently again (it did once, with `trusted_sources`).

## The rule

1. Any schema change is a new file here: `NNNN_short_name.sql`, numbered in order.
2. Every statement is **idempotent** — `create table if not exists …`,
   `alter table … add column if not exists …`. Re-running a migration must be safe.
3. The code that depends on a migration must **degrade, not crash**, until it's
   applied (e.g. the source store falls back to empty). A migration is a
   deploy-blocker only if you choose to make it one — note that in the PR.
4. When you apply one to prod, tick it in the checklist below **in the same PR**.
5. `../supabase/schema.sql` stays the canonical full schema (what a fresh project
   needs). Migrations are the ordered deltas on top of it; when you add a
   migration, also fold it into `schema.sql` so a new environment gets it.

## Applying

Supabase dashboard → your project → **SQL Editor** → New query → paste the file →
**Run**. Direct link for this project:
`https://supabase.com/dashboard/project/hmjzbgpavngxujppxinx/sql/new`

## Checklist

| Migration | Applied to prod | Date | Note |
|-----------|:---------------:|------|------|
| `0001_trusted_sources.sql` | ✅ | 2026-08-24 | vetted-sources registry (connector spec, phase 1) |
| `0002_sites_files.sql` | ⬜ | — | `files` jsonb on `sites` (already in schema.sql; confirm on prod) |
| `0003_enable_rls.sql` | ⬜ | — | RLS on user tables; blocks direct anon-key reads (app uses service_role) |

> New rows go at the bottom. `⬜` = not yet run against prod.
