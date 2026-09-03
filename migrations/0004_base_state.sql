-- ТР-БИ-03: состояние темы и формулировка искомого на уровне базы (темы).
-- state: null|'unexplored'|'in_progress'|'closed' — стадия исследования темы.
-- query: свободный текст «что ищем» (формулировка искомого).
-- Идемпотентно (НФТ-09): повторный прогон ничего не ломает; код читает/пишет
-- эти колонки толерантно, поэтому до прогона миграции всё работает без них.
alter table bases add column if not exists state text;
alter table bases add column if not exists query text;
