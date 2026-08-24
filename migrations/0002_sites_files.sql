-- 0002 — per-site uploaded files manifest.
-- A static site keeps the list of files it consists of; a single-file upload is
-- validated against it. Mirrors the statement already in supabase/schema.sql.
-- NOT yet confirmed applied to prod — see migrations/README.md checklist.
alter table sites add column if not exists files jsonb not null default '[]';
