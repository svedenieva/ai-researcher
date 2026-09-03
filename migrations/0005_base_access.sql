-- ТР-БД-03: пер-пользовательская выдача доступа к базе. Владелец выдаёт доступ
-- конкретным людям по email (НФТ-19), и может отозвать (НФТ-20). Личная база без
-- выдачи не видна другим (изоляция контуров, ТР-БД-05).
-- Идемпотентно (НФТ-09); код читает/пишет толерантно — до прогона доступов нет,
-- но всё остальное работает.
create table if not exists base_access (
  base_id text not null references bases(id),
  email   text not null,
  created_at timestamptz not null default now(),
  primary key (base_id, email)
);
create index if not exists base_access_email_idx on base_access (email);
