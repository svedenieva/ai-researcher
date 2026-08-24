-- 0001 — trusted-sources registry (connector spec, phase 1).
-- The company's vetted platforms, channels and experts, tagged by topic. The
-- MCP tool list_trusted_sources and the /sources page both read this table.
-- Applied to prod 2026-08-24.
create table if not exists trusted_sources (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  type       text not null default 'platform',
  url        text not null default '',
  topics     jsonb not null default '[]',
  note       text,
  created_at timestamptz not null default now()
);
