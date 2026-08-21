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

-- манифест, согласованный при создании: список путей, из которых сайт
-- реально состоит. Дозагрузка одного файла (POST .../files) сверяется
-- с ним — иначе лимиты выше (MAX_FILES, суммарный объём) можно было обойти,
-- докладывая файлы по одному в уже существующий сайт.
alter table sites add column if not exists files jsonb not null default '[]';

-- Реестр общий: владелец записан для отображения, а не для ограничения
-- доступа. Все, кто прошёл вход, видят все сайты — в отличие от таблицы
-- `bases`, где записи делятся по владельцам.

-- ─────────────────────────────────────────────────────────────
--  Пользовательские базы (цель №1) и их строки.
--  Раньше создавались руками в консоли; здесь — канонический DDL.
--  jsonb `columns`/`data` — схема без миграций; deleted_at — корзина.
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

-- корзина: delete → выставляет deleted_at; restore → null; empty → реальный DELETE
alter table bases        add column if not exists deleted_at timestamptz;
alter table base_records add column if not exists deleted_at timestamptz;
create index if not exists bases_deleted_at_idx        on bases (deleted_at);
create index if not exists base_records_deleted_at_idx on base_records (deleted_at);
