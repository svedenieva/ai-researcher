# AI-Researcher

A knowledge-base storefront for AiVocado: a tree of **bases** (spreadsheet-like tables), a curated product **catalog**, and a research flow that lets a user's own Claude fill a base with real, source-backed findings. Bases, rows, and columns are fully editable from the UI **and** over an MCP connector, with a soft-delete recycle bin behind every destructive action.

Production: **https://ai-reesearcher.vercel.app**

---

## Features

- **Bases as a tree** — each base has its own columns and rows; bases nest inside one another via a `parent`. Four built-in bases are read-only catalog slices (`market`, `ai`, `it`, `workforce`); user bases are fully editable.
- **Spreadsheet grid** (`@aivocado/mindsheet`) — click-to-edit cells, an add-row line, coloured status badges (click a badge to filter), rubber/manual column widths, up-to-3-level sort with auto-grouping and per-group aggregates, drag-to-reorder rows, a record card for long fields, per-base view settings, and row virtualization (only visible rows in the DOM).
- **Full CRUD + recycle bin** — add / rename / retype / delete / reorder columns; rename / move / delete bases; delete rows. Every delete goes to a **bin** (`/bin`); only "empty bin" is permanent (confirm-gated). Column key is immutable, so cell data is never lost on a column edit.
- **Catalog** — hundreds of companies in Supabase, filterable by section (AI / IT / WorkOS), vertical, region, verdict, popularity; per-company detail page; CSV export (RFC 4180) of exactly what's on screen.
- **Import** — build a base from Google Sheets / CSV / TSV paste; columns are derived from the header row.
- **Research (Variant C)** — describe any topic → the site opens the user's **own Claude** via a deeplink with a ready-made prompt → Claude researches (its own web search + this connector), picks columns that fit the question, and writes rows into a private run-base → the page polls the base and shows the result. No server-side LLM key needed for the search itself.
- **MCP connector** — drive everything from Claude Desktop / Claude Code: two transports (local stdio and an HTTP endpoint), 18 tools, shared instructions.
- **Sites module** (`/sites`) — a registry of static sites uploaded as a folder or `.zip` (via `fflate`), served from a private Supabase Storage bucket.
- **i18n** — UI language switcher (Ukrainian / Russian / English), Ukrainian by default, remembered in `localStorage`.
- **Auth** — Google OAuth (Supabase) gated by an email allowlist; closed by default.

---

## Tech stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **Supabase** — Postgres (data) + Auth (Google OAuth) + Storage (site files)
- **@aivocado/mindsheet** — the table/grid engine (its own git repo, shared with the Fathom project)
- **@anthropic-ai/sdk** — optional, for research-query decomposition
- **fflate** — zip pack/unpack in the browser and on the server
- **Vitest** + Testing Library — unit and route tests
- **Vercel** — hosting and deploys

---

## Getting started

Prerequisites: Node.js 20+ and a Supabase project.

```bash
npm install
cp .env.local.example .env.local   # then fill in the values (see below)
npm run dev                         # http://localhost:3000
```

Scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | production build |
| `npm start` | run the production build |
| `npm test` | run the Vitest suite once |
| `npm run test:watch` | watch mode |
| `npx tsc --noEmit` | type-check |

Tests run against an **in-memory** data store by default (no Supabase needed). Set `DATA_SOURCE=supabase` to use the real database.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes (prod) | Supabase project URL (server) |
| `SUPABASE_SERVICE_KEY` | yes (prod) | Service-role key — server access, bypasses RLS |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase URL for the browser (auth) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key (auth) |
| `DATA_SOURCE` | yes (prod) | `supabase` to use Postgres; otherwise an in-memory store |
| `ALLOWED_EMAILS` | yes | Comma-separated Google-login allowlist (`a@x.com,b@y.com`) |
| `MCP_TOKENS` | for HTTP MCP | `token:email` pairs (`tok1:a@x.com,tok2:b@y.com`) — auth for `/api/mcp` |
| `ANTHROPIC_API_KEY` | optional | Enables Claude-based decomposition in the `research_decompose` tool (falls back to a heuristic otherwise) |
| `RESEARCH_MODEL` | optional | Model for decomposition (default `claude-opus-5`) |

> The service-role key and `MCP_TOKENS` are secrets — never expose them to the browser. In Vercel, set all of these under Project → Settings → Environment Variables, then redeploy for changes to take effect.

---

## Architecture

**Data layer** (`lib/datasource/`) — one `DataSource` interface over two backends: an in-memory store (dev/tests) and Supabase (prod). Custom bases and their rows live in the `bases` and `base_records` tables (JSON columns, plus a `deleted_at` recycle-bin marker); the product catalog lives in `products`.

**API routes** (`app/api/`):

- `records` (+ `export`, `reorder`) — read/add/update/delete rows
- `bases`, `columns`, `bin` — base CRUD, column management, the recycle bin
- `favorites`, `research/start`, `sites/*`, `s/[id]/…` (static-site serving)
- `mcp` — the HTTP MCP endpoint (JSON-RPC 2.0, token-authed)

**MCP connector** — 19 tools over one HTTP transport (`app/api/mcp/route.ts`),
one URL + a personal token; nothing to install on the user's machine. Server
instructions live in `lib/mcp/instructions.mjs`.

Tools: `list_bases`, `get_base`, `create_base`, `add_rows`, `query_records`, `update_record`, `add_column`, `update_column`, `delete_column`, `rename_base`, `move_base`, `delete_base`, `delete_rows`, `list_bin`, `restore`, `empty_bin`, `catalog_search`, `research_decompose`, `list_trusted_sources`.

---

## Using the MCP connector

**HTTP (recommended — nothing to install):** add a custom/remote MCP server in Claude Desktop pointing at:

```
https://ai-reesearcher.vercel.app/api/mcp
```

with header `Authorization: Bearer <your-token>` (your token comes from `MCP_TOKENS`; `?token=…` in the URL also works as a fallback). Open the URL with `?token=…` in a browser to self-check (`authorized: true` + the tool list). The `/connect` page shows your own token and a ready `claude mcp add …` command.

**In this repo (`.mcp.json`):** the checked-in config uses the same HTTP endpoint and reads the token from an env var, so no secret is committed:

```json
{ "mcpServers": { "ai-researcher": { "type": "http", "url": "https://ai-reesearcher.vercel.app/api/mcp", "headers": { "Authorization": "Bearer ${AI_RESEARCHER_MCP_TOKEN}" } } } }
```

Set `AI_RESEARCHER_MCP_TOKEN` to your personal token before starting the client.

> The old local **stdio** server (`mcp/server.mjs`) was removed: it was a second
> 2500-line reimplementation that drifted out of parity with the HTTP route
> (missing tools, missing fixes). The HTTP connector above is the single source
> of truth.

Access model: a token sees its **own + shared + ownerless** bases. Built-in catalog bases are read-only.

---

## Deployment

Deploys go to Vercel (project `ai-reesearcher`). This repo is linked via `.vercel/`; deploy the current working tree with:

```bash
vercel deploy --prod
```

Vercel injects the environment variables from the project settings. The database schema lives in `supabase/schema.sql` (applied by hand in the Supabase SQL Editor).

---

## Project structure

```
app/            Next.js App Router — pages (home, /bin, /research, /sites, /product/[id], /login) and api/ routes
lib/
  datasource/   DataSource interface, in-memory + Supabase backends, custom bases, columns, dedup, CSV
  research/     decompose (subtopics) + deeplink (Variant C prompt to the user's Claude)
  sites/        static-site registry + zip pack/unpack
  mcp/          shared connector instructions
  i18n.ts       UI strings (uk/ru/en)
  supabase-auth.ts, current-user.ts   Google OAuth + allowlist
mcp/            stdio MCP server + test client
supabase/       schema.sql
docs/           specs and plans
```

---

## Testing

```bash
npm test            # Vitest, in-memory store
npx tsc --noEmit    # type-check
```

Route handlers are tested in-process against the in-memory store, so no Supabase is required for the suite.
