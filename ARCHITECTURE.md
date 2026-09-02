# AI-Researcher — architecture

A knowledge-base workspace for research and competitive intelligence: a fast,
spreadsheet-style grid over **nested user bases**, a research flow that runs on the
**user's own** Claude subscription (or a server-side agent behind a flag), and an
MCP connector that lets any Claude client read and edit the bases. Built on Next.js
+ Supabase; deployed on Vercel.

## System at a glance

```mermaid
flowchart TB
  subgraph Client["Browser — Next.js App Router UI"]
    Grid["MindSheet grid<br/>(@aivocado/mindsheet)"]
    Pages["pages: / · /bases · /research<br/>/sources · /sites · /bin · /topic · /p"]
  end

  subgraph Edge["Next.js route handlers (server)"]
    MW["middleware.ts — auth gate (fail-closed)"]
    DATA["/api/bases · /api/records(+import,export,<br/>scrape,share-link,reorder) · /api/columns · /api/bin"]
    RES["/api/research/{start,server,runs,eval}"]
    MCPH["/api/mcp — JSON-RPC connector 'AiS'<br/>(personal token → email → scope)"]
  end

  subgraph Data["Supabase (Postgres + RLS)"]
    DB[("bases · base_records<br/>sites · trusted_sources · products")]
  end

  UserClaude["User's own Claude<br/>(their subscription)"]
  Anthropic["Anthropic API<br/>(server agent, flagged)"]
  Scrape["ScrapeGraphAI v2<br/>/extract"]

  Grid --> MW --> DATA -->|service_role key| DB
  RES -->|creates run base| DB
  RES -->|deeplink (prefilled prompt)| UserClaude
  RES -.->|flagged + quota| Anthropic
  UserClaude -->|MCP tools: add_rows, query_records, …| MCPH --> DB
  DATA -->|extract from URL| Scrape
```

## Tech stack

- **Frontend** — Next.js 15 (App Router), React 19, TypeScript. Grid via the
  git-pinned package `@aivocado/mindsheet`. Mind-map canvas via `@xyflow/react`
  (vendored under `lib/mindmap`). Local state with React + `zustand`.
- **Backend** — Next.js server route handlers (no separate API server).
- **Database** — Supabase (Postgres) with Row-Level Security. Server reads/writes
  with the `service_role` key; the browser only uses the `anon` key for auth.
- **Auth** — Supabase Auth (Google OAuth), cookie session; `middleware.ts` gates
  every route and fails closed.
- **Deploy** — Vercel; `git push` → auto-deploy. Production: `ai-reesearcher.vercel.app`.

## Frontend

- `app/page.tsx` — the main workspace: left sidebar (base tree + global search +
  section links), the grid, the top bar (mode tabs + inline summary, AI actions,
  import/export/scrape, share). Language via `lang-provider` (uk / ru / en).
- Pages: `/bases` (showcase tree), `/research` (research runs), `/sources`
  (trusted-source registry), `/sites`, `/bin` (recycle), `/connect` (connector
  setup), `/login`, `/topic/[base]/[record]` (reading-view "article"),
  `/p/[id]` (public read-only base via HMAC token).
- Key components: `base-tree` (sidebar explorer, «⋯» menu, Researcher/Knowledge
  groups), `base-summary` (inline metrics + funnel), `create-base` (templates +
  import), `base-ai-actions`, `saved-views`, `global-search`.

## API routes

- **Data** — `/api/bases`, `/api/records` (+ `import`, `export`, `scrape`,
  `share-link`, `reorder`, `check-links`, `dedupe`), `/api/columns`, `/api/bin`,
  `/api/favorites`, `/api/search`, `/api/sources`, `/api/sites` (+ `[id]`,
  `files`, `download`).
- **Research** — `/api/research/start` (Variant C deeplink), `/api/research/server`
  (server agent, flag + per-user quota), `/api/research/runs`, `/api/research/eval`.
- **Connector** — `/api/mcp` (JSON-RPC MCP server, personal token), `/api/connect`.

## Data model & access

- Tables: `bases` (id, name, tone, columns `jsonb`, parent, owner_email, shared,
  created_at, deleted_at), `base_records` (base_id, data `jsonb`, position,
  deleted_at), `sites`, `trusted_sources`, plus the built-in `products` catalog.
- Custom columns and row values live in `jsonb` — new column types and per-row
  system fields (`__mode`, `__tags`, `__updated`) need **no migration**.
- **Isolation** — a base is visible to its owner, to everyone if `shared`, or if
  `owner === null` (legacy/team). Enforced by `canAccessBase` and by RLS
  (`migrations/0003`). Server routes use the service key and re-check access.
- **Inherited tree** — opening a base merges its descendants' rows and the
  **union** of their columns; each row carries `__baseId` so edits go to the base
  it actually lives in.

## Library layout (`lib/`)

- **datasource** — `customStore` (bases + records CRUD, bin), `bases` (built-in),
  `columns`, `tree` (descendants, path), `json` (`JsonDataSource`: list, filter,
  facets, sort, group), `dedupe`, `types`.
- **domain** — `mode` (Исследование / Эталон), `tags`, `presets` (base templates),
  `importTable` / `parseTable` / `markdownTable` / `csv` (import-export & MD
  round-trip), `coerce`, `limits`, `records-query`, `i18n`, `tone`, `safe-url`,
  `current-user`, `supabase-auth`, `errors`.
- **research** — `server-agent` (Anthropic), `deeplink` (Variant C), `runs`
  (run bases + quota), `verify-quote`, `links` (source check), `report` (MD),
  `eval` / `eval-set`, `decompose`, `base-actions` (AI actions), `sources`
  (trusted registry), `scrape` (ScrapeGraphAI v2), `share` (HMAC links).

## External integrations

- **The user's own Claude** — the default research flow: `/api/research/start`
  opens Claude with a ready prompt; that Claude writes results into a run base
  through the MCP connector. No data leaves for a third party.
- **Anthropic API** — the optional server-side research agent (`ANTHROPIC_API_KEY`
  + `RESEARCH_SERVER_AGENT=1`), rate-limited by a per-user daily quota.
- **ScrapeGraphAI v2** — `POST v2-api.scrapegraphai.com/api/extract` turns a page
  URL into structured JSON shaped by the base's columns (`SCRAPEGRAPHAI_API_KEY`).
- **Supabase** — database, auth, storage of uploaded sites/files.

## Key flows

1. **Bases & grid** — UI → `/api/records|bases|columns` → `customStore` → Supabase.
   A parent base shows the merged, column-unioned view of its subtree.
2. **Research (Variant C)** — create a run base under *AI-сфера*, deeplink the
   user's Claude with a prompt; the run polls the base and shows coverage. Results
   are gated by verbatim-quote and source-resolution checks and deduped.
3. **Import / export** — CSV/TSV/Markdown import; the Markdown-table export is the
   exact inverse of the importer, so a base round-trips (export → edit → re-import
   into the same base, keeping its types).
4. **Scrape** — `/api/records/scrape` sends the base's columns as an extraction
   schema to ScrapeGraphAI and maps the returned items to rows.
5. **Sharing** — `/api/records/share-link` mints an HMAC token; `/p/[id]?t=` serves
   a read-only view without login.
6. **Summary & activity** — computed on the client from the loaded rows and the
   `__updated` stamps written on every add/edit/import.

## Security

- Auth gate in middleware (fail-closed); the MCP token maps to an email and scopes
  every call; private bases never confirm their existence to a non-owner.
- Hardening: SSRF closed (redirects / numeric IPs), URL columns accept only safe
  schemes, uploaded sites are sandboxed away from the API and cookies, row/cell/
  name/nesting limits, CSV-formula-injection guard, RLS in CI (`npm run check:rls`).
