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

-- ─────────────────────────────────────────────────────────────
--  Раздел «Сайты»: реестр статических сайтов.
--  Файлы лежат в Storage, в ПРИВАТНОМ бакете `sites`,
--  под ключом <id>/<путь внутри сайта>. Бакет заводится руками:
--  Storage → New bucket → имя sites → Public выключить.
--  Здесь только описание сайта, не его содержимое.
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

-- Реестр общий: владелец записан для отображения, а не для ограничения
-- доступа. Все, кто прошёл вход, видят все сайты — в отличие от таблицы
-- `bases`, где записи делятся по владельцам.
