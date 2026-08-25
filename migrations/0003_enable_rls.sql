-- 0003 — enable Row-Level Security.
--
-- The app talks to Postgres server-side with the service_role key, which BYPASSES
-- RLS — so turning RLS on does not change how the app reads or writes anything.
-- What it does change: with RLS enabled and no anon/authenticated policies, the
-- PUBLIC anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY, shipped to every browser) can no
-- longer read these tables directly through PostgREST. That closes a path around
-- the API entirely — the "what stops user A reading user B's data" question.
--
-- No policies are added on purpose: default-deny for anon/authenticated, full
-- access for service_role (the app). Safe to re-run.
alter table bases           enable row level security;
alter table base_records    enable row level security;
alter table sites           enable row level security;
alter table trusted_sources enable row level security;

-- products (catalog) is currently served from data/catalog.json, not Supabase.
-- If/when a products table exists, enable it too:
--   alter table products enable row level security;
