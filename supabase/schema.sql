-- ─────────────────────────────────────────────────────────────
--  Catalog table for AI-Researcher.
--  To apply: Supabase -> SQL Editor -> paste and Run.
--  One row = one company. Every field lives in the jsonb `data` column,
--  so adding a new field needs no migration.
-- ─────────────────────────────────────────────────────────────
create table if not exists products (
  id   text primary key,
  data jsonb not null
);

-- The server uses the service_role key and bypasses RLS.
-- If browser access under the anon key is ever opened up,
-- turn RLS on and add a read policy:
--   alter table products enable row level security;
--   create policy "read products" on products for select using (true);

-- ─────────────────────────────────────────────────────────────
--  The Sites module: a registry of static sites.
--  Files live in Storage, in the PRIVATE `sites` bucket,
--  keyed <id>/<path inside the site>. The bucket is created by hand:
--  Storage -> New bucket -> name it sites -> leave Public off.
--  This table holds the site's description only, never its contents.
-- ─────────────────────────────────────────────────────────────
create table if not exists sites (
  id          text primary key,          -- слаг из названия, при совпадении суффикс -2
  name        text not null,
  client      text,
  tags        text[] not null default '{}',
  note        text,
  entry       text not null default 'index.html',
  file_count  int  not null default 0,
  size_bytes  bigint not null default 0,
  owner       text,                      -- почта того, кто залил
  created_at  timestamptz not null default now()
);

-- The manifest agreed at creation: the list of paths the site actually
-- consists of. A single-file upload (POST .../files) is checked against
-- it; without that, the ceilings above (MAX_FILES, total size) could be
-- bypassed one file at a time into an already-existing site.
alter table sites add column if not exists files jsonb not null default '[]';

-- The registry is shared: the owner is recorded for display, not to
-- restrict access. Everyone signed in sees every site, unlike the `bases`
-- table, whose rows are partitioned by owner.

-- ─────────────────────────────────────────────────────────────
--  User bases (goal #1) and their rows.
--  These used to be created by hand in the console; this is the canonical DDL.
--  jsonb `columns`/`data` = schema without migrations; deleted_at = recycle bin.
-- ─────────────────────────────────────────────────────────────
create table if not exists bases (
  id          text primary key,
  name        text not null,
  tone        text not null,
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

-- recycle bin: delete sets deleted_at; restore clears it; empty is a real DELETE
alter table bases        add column if not exists deleted_at timestamptz;
alter table base_records add column if not exists deleted_at timestamptz;
create index if not exists bases_deleted_at_idx        on bases (deleted_at);
create index if not exists base_records_deleted_at_idx on base_records (deleted_at);

--  Trusted sources registry: platforms, channels and experts the company
--  trusts, tagged by topic. A research run consults it before searching.
--  Company-wide (not owner-scoped): everyone signed in sees the same registry.
create table if not exists trusted_sources (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  type       text not null default 'platform',   -- platform | channel | expert
  url        text not null default '',
  topics     jsonb not null default '[]',         -- lowercase topic tags
  note       text,
  created_at timestamptz not null default now()
);
