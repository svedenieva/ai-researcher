import type { ColumnDef } from './types';

export const CATALOG_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Название', type: 'text', sortable: true },
  { key: 'url', label: 'Сайт', type: 'url' },
  { key: 'region', label: 'Регион', type: 'select', sortable: true, filterable: true },
  { key: 'country', label: 'Страна', type: 'text', sortable: true },
  { key: 'vertical', label: 'Вертикаль', type: 'select', sortable: true, filterable: true },
  { key: 'founded', label: 'Основана', type: 'number', sortable: true },
  { key: 'description', label: 'Описание', type: 'long-text' },
  { key: 'products', label: 'Продукты', type: 'long-text' },
  { key: 'pricing', label: 'Цены', type: 'text' },
  { key: 'plans_detail', label: 'Тарифы', type: 'long-text' },
  { key: 'traction', label: 'Трекшн', type: 'text' },
  { key: 'grade', label: 'Грейд', type: 'select', sortable: true, filterable: true },
  { key: 'idea_for_ais', label: 'Идея для AiS', type: 'long-text' },
  { key: 'tasks', label: 'Задачи', type: 'long-text' },
  { key: 'howto', label: 'Как применить', type: 'long-text' },
  { key: 'reddit', label: 'Reddit', type: 'long-text' },
];
