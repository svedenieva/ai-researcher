# Row-Level Security & the data-isolation model

This is the "what stops user A reading user B's data" answer, written down.

## The model in one paragraph

The app never talks to Postgres from the browser. Every read and write goes
through a Next.js API route on the server, and those routes use the Supabase
**`service_role`** key. `service_role` **bypasses RLS** by design, so the app
sees everything and enforces access itself in code (own / shared / ownerless
bases; a personal token → email for the MCP connector). RLS is therefore not
what the *app* relies on — it's the wall around the app: with RLS **enabled and
no policies**, the **public `anon` key** (which ships in every browser as
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) can no longer read these tables directly through
PostgREST. That closes the one path that would go *around* the API.

```
Browser ──(anon key: auth only)──▶ Supabase Auth        ✅ allowed
Browser ──(anon key: SELECT * FROM bases)──▶ PostgREST   ⛔ RLS → 0 rows
Browser ──▶ Next.js API route ──(service_role)──▶ Postgres ✅ app-level checks
```

## Why there are no per-row policies

Per-row `USING (...)` policies matter only when a client queries the tables
**directly** with the `anon` / `authenticated` role. This app never does that —
the browser holds no session against the tables, only against Auth. So the
correct, minimal configuration is:

- **RLS ON** for every user table, and
- **no policies** → default-deny for `anon`/`authenticated`, full access for
  `service_role` (the app).

Per-row policies would become necessary only if we moved data access to the
client (e.g. calling `supabase.from('bases')` from the browser). If that ever
happens, add policies keyed on `auth.jwt()->>'email'` matching the same
own/shared/ownerless rule the API already implements — until then they'd be dead
code that implies a client path that doesn't exist.

## Tables & status

RLS is enabled on every table that holds user data (migration
`0003_enable_rls.sql`). The catalog (`products`) is served from
`data/catalog.json`, not Postgres, so it isn't listed.

| Table | Holds | RLS |
|-------|-------|-----|
| `bases` | user knowledge bases | ✅ on |
| `base_records` | rows of those bases | ✅ on |
| `sites` | uploaded static sites | ✅ on |
| `trusted_sources` | the connector's vetted-sources registry | ✅ on |

## How to verify (repeatable)

One command, run it before a deploy:

```bash
npm run check:rls        # node --env-file=.env.local scripts/check-rls.mjs
```

For every user table it checks the anon key against **both** paths and prints a
PASS/FAIL table (exit 1 on any hole):

- **read** — anon `SELECT` must return 0 rows while the service key shows the real
  count. Service-has-data + anon-sees-nothing proves RLS is doing the blocking.
- **write** — anon `INSERT` of a minimal valid row must be denied with Postgres
  `42501` ("violates row-level security policy"). This is the decisive signal and
  works even for an **empty** table, where the read test alone can't tell "RLS
  blocks" from "no data". A denied insert writes nothing; if RLS were off and the
  insert slipped through, the script deletes the row again via the service key.

The equivalent by hand (what the script automates):

```bash
# service key → rows come back;  anon key → must be []  (RLS working on read)
curl "$SUPABASE_URL/rest/v1/bases?select=*&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
curl "$SUPABASE_URL/rest/v1/bases?select=*&limit=1" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

Last verified **2026-08-26** (`npm run check:rls`, all 4 PASS): anon is blocked on
both read and write for `bases` (svc 21 rows), `base_records` (svc 155),
`trusted_sources` (svc 4) and `sites` (empty — confirmed via the `42501` write
probe). Anon read returns `[]`; anon write returns `42501` on every table.

## Applying / migrations

DDL (`alter table … enable row level security`) can't run through the PostgREST
service key — apply it in the **Supabase SQL Editor**. Migrations live in
`migrations/` with an ordered, idempotent `.sql` per change and an "applied to
prod" checklist in `migrations/README.md`.
