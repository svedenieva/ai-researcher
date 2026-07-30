-- ─────────────────────────────────────────────────────────────
--  Таблица каталога для AI-Researcher.
--  Применить: Supabase → SQL Editor → вставить и Run.
--  Одна строка = одна компания. Все поля лежат в jsonb `data`,
--  поэтому добавление новых колонок не требует миграций.
-- ─────────────────────────────────────────────────────────────
create table if not exists products (
  id   text primary key,
  data jsonb not null
);

-- Сервер ходит под service_role-ключом и обходит RLS.
-- Если позже откроете доступ из браузера под anon-ключом —
-- включите RLS и добавьте политику на чтение:
--   alter table products enable row level security;
--   create policy "read products" on products for select using (true);
