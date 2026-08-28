import type { ColumnDef } from './types';

// Grid columns first (short — shown in the table), then long-text columns
// (moved into the click-to-open row detail by the mind-sheet).
export const CATALOG_COLUMNS: ColumnDef[] = [
  // ── grid ──
  { key: 'name', label: 'Название', type: 'text', sortable: true },
  {
    key: 'section', label: 'Раздел', type: 'select', sortable: true, filterable: true,
    order: ['IT', 'AI', 'WorkOS'],
    badge: true,
    badgeVariant: { IT: 'blue', AI: 'teal', WorkOS: 'amber' },
  },
  {
    key: 'verdict', label: 'Вердикт', type: 'select', sortable: true, filterable: true,
    order: ['Строить своё', 'Услуга / идея', 'Инструмент', 'Мониторить'],
    badge: true,
    badgeVariant: {
      'Строить своё': 'green',
      'Услуга / идея': 'amber',
      'Инструмент': 'blue',
      'Мониторить': 'grey',
    },
  },
  {
    key: 'pop', label: 'Популярность', type: 'select', sortable: true, filterable: true,
    order: ['Высокая', 'Средняя', 'Нишевая'],
    badge: true,
    badgeVariant: {
      'Высокая': 'red',
      'Средняя': 'amber',
      'Нишевая': 'grey',
    },
  },
  { key: 'vertical', label: 'Вертикаль', type: 'select', sortable: true, filterable: true },
  { key: 'region', label: 'Регион', type: 'select', sortable: true, filterable: true },
  { key: 'country', label: 'Страна', type: 'text', sortable: true },
  { key: 'founded', label: 'Основана', type: 'number', sortable: true },
  {
    key: 'grade', label: 'Достоверность', type: 'select', sortable: true, filterable: true,
    order: ['E1 · подтверждено', 'E2 · надёжно', 'E4 · оценка', 'E6 · проверить'],
    badge: true,
    badgeVariant: {
      'E1 · подтверждено': 'green',
      'E2 · надёжно': 'teal',
      'E4 · оценка': 'amber',
      'E6 · проверить': 'grey',
    },
  },
  { key: 'url', label: 'Сайт', type: 'url' },
  { key: 'pricing', label: 'Цены', type: 'text' },
  { key: 'traction', label: 'Трекшн', type: 'text' },
  // ── detail (long-text → row expand) ──
  { key: 'description', label: 'Описание', type: 'long-text' },
  { key: 'products', label: 'Продукты', type: 'long-text' },
  { key: 'idea_for_ais', label: 'Идея для AiS', type: 'long-text' },
  { key: 'roleWhy', label: 'Почему такая роль', type: 'long-text' },
  { key: 'howto', label: 'Как применить', type: 'long-text' },
  { key: 'tasks', label: 'Задачи', type: 'long-text' },
  { key: 'plans_detail', label: 'Тарифы', type: 'long-text' },
  { key: 'reddit', label: 'Reddit', type: 'long-text' },
  { key: 'twitter', label: 'Twitter / X', type: 'long-text' },
  { key: 'deep_verdict', label: 'Вердикт (глубокий)', type: 'long-text' },
  { key: 'deep_market', label: 'Рынок', type: 'long-text' },
  { key: 'deep_competition', label: 'Конкуренты', type: 'long-text' },
  { key: 'deep_entry_path', label: 'Пути входа', type: 'long-text' },
  { key: 'deep_effort', label: 'Трудозатраты', type: 'long-text' },
  { key: 'deep_monetization', label: 'Монетизация', type: 'long-text' },
  { key: 'deep_risks', label: 'Риски', type: 'long-text' },
  { key: 'deep_product_teardown', label: 'Разбор продукта', type: 'long-text' },
  { key: 'deep_user_complaints', label: 'Жалобы пользователей', type: 'long-text' },
];
