import type { ColumnDef, ListParams } from './datasource/types';

// Base templates offered in "New base" beside blank / import. A preset is just a
// ready-made column schema (no migration — columns live in bases.columns jsonb).
//
// §5.9 «Дашборд внедрения»: the same MindSheet, but process-shaped — a list of
// know-how and how we carry each through the stages. There is NO special UI; the
// process board is the grid grouped by the «Стадия» column, so the preset marks
// «Стадия» as the default grouping and gives each stage its own colour + order.

export interface BasePreset {
  id: string;
  name: string;
  /** short subtitle shown on the template card */
  blurb: string;
  /** the column schema seeded on create (keys are derived server-side) */
  columns: Array<Omit<ColumnDef, 'key'>>;
  /** optional seed rows, positional to `columns` (row[i] ↔ columns[i]); used to
      ship a template pre-filled, e.g. the AI-Researcher roadmap with its tasks */
  rows?: Array<Array<string | number>>;
}

// The five stages, in the order a know-how travels through them. Each gets its
// own badge colour so the board reads at a glance.
const STAGES = ['Изучение', 'Внедрение', 'Написание инструкции', 'Обучение', 'Проверка применения'] as const;
const STAGE_COLORS: Record<string, string> = {
  'Изучение': 'blue',
  'Внедрение': 'teal',
  'Написание инструкции': 'amber',
  'Обучение': 'purple',
  'Проверка применения': 'green',
};

export function implementationPreset(): BasePreset {
  return {
    id: 'implementation',
    name: 'Внедрение',
    blurb: 'Процессная доска ноу-хау по стадиям: Изучение → … → Проверка применения',
    columns: [
      { label: 'Ноу-хау', type: 'text', sortable: true },
      {
        label: 'Стадия',
        type: 'select',
        sortable: true,
        filterable: true,
        badge: true,
        order: [...STAGES],
        badgeVariant: { ...STAGE_COLORS },
        // opening this base groups by «Стадия» → a process board (pseudo-kanban)
        defaultGroup: true,
      },
      { label: 'Ответственный', type: 'text', sortable: true },
      { label: 'Инструкция', type: 'url' },
      { label: 'Дата', type: 'date', sortable: true },
      { label: 'Заметки', type: 'long-text' },
    ],
  };
}

// §method-map: «Эксперты по теме» — the best experts per topic, with a trust
// rating. Feeds the search method (Этап 2: «лучшие эксперты по теме»).
export function expertsPreset(): BasePreset {
  return {
    id: 'experts',
    name: 'Эксперты по теме',
    blurb: 'Лучшие эксперты по темам: платформа, ссылка, доверие',
    columns: [
      { label: 'Эксперт', type: 'text', sortable: true },
      { label: 'Тема', type: 'text', sortable: true, filterable: true },
      { label: 'Платформа', type: 'text', sortable: true },
      { label: 'Ссылка', type: 'url' },
      { label: 'Доверие', type: 'rating', sortable: true },
      { label: 'Заметки', type: 'long-text' },
    ],
  };
}

// §method-map: «Матрица знаний» — types/kinds/categories of knowledge with the
// source, platform and a trust rating (Этап 2: критерии доверия, ранжирование).
export function knowledgeMatrixPreset(): BasePreset {
  const TYPES = ['Статья', 'Видео', 'Курс', 'Отчёт', 'Статистика', 'Библиотека'] as const;
  return {
    id: 'knowledge-matrix',
    name: 'Матрица знаний',
    blurb: 'Типы/виды/категории знаний + источник, платформа, доверие',
    columns: [
      { label: 'Знание', type: 'text', sortable: true },
      {
        label: 'Тип', type: 'select', sortable: true, filterable: true, badge: true,
        order: [...TYPES],
        badgeVariant: { 'Статья': 'blue', 'Видео': 'red', 'Курс': 'purple', 'Отчёт': 'teal', 'Статистика': 'amber', 'Библиотека': 'green' },
      },
      { label: 'Категория', type: 'text', sortable: true, filterable: true },
      { label: 'Платформа', type: 'text', sortable: true },
      { label: 'Источник', type: 'url' },
      { label: 'Доверие', type: 'rating', sortable: true },
      { label: 'Заметки', type: 'long-text' },
    ],
  };
}

// §method-map: «Дорожная карта AI-Researcher» — the search-method stages 0–7 as a
// task board (grouped by «Этап»), seeded with the ✔️-tasks from the mind map.
export function roadmapPreset(): BasePreset {
  const STAGE = {
    s0: '0 · Проблема', s1: '1 · Задача', s2: '2 · Карта знаний', s3: '3 · Поиск',
    s4: '4 · Авторы', s5: '5 · База знаний', s6: '6 · Декомпозиция', s7: '7 · Батл',
  };
  const TODO = 'Не начато';
  return {
    id: 'roadmap',
    name: 'Дорожная карта AI-Researcher',
    blurb: 'Этапы 0–7 метода поиска как доска задач (сгруппировано по этапу)',
    columns: [
      { label: 'Задача', type: 'text', sortable: true },
      {
        label: 'Этап', type: 'select', sortable: true, filterable: true, badge: true, defaultGroup: true,
        order: Object.values(STAGE),
        badgeVariant: {
          [STAGE.s0]: 'grey', [STAGE.s1]: 'blue', [STAGE.s2]: 'teal', [STAGE.s3]: 'green',
          [STAGE.s4]: 'purple', [STAGE.s5]: 'amber', [STAGE.s6]: 'red', [STAGE.s7]: 'blue',
        },
      },
      {
        label: 'Статус', type: 'select', sortable: true, filterable: true, badge: true,
        order: [TODO, 'В работе', 'Готово'],
        badgeVariant: { [TODO]: 'grey', 'В работе': 'amber', 'Готово': 'green' },
      },
      { label: 'Заметки', type: 'long-text' },
    ],
    rows: [
      ['Определить участвующие модели (4 LLM)', STAGE.s0, TODO, ''],
      ['Изучить консенсус как функцию', STAGE.s0, TODO, ''],
      ['Определить, какие данные нужны на вход для поиска', STAGE.s1, TODO, ''],
      ['Определить типы документов и сущностей', STAGE.s1, TODO, ''],
      ['Определить правила формирования промпта', STAGE.s1, TODO, ''],
      ['Адаптивность промпта под категорию запроса', STAGE.s1, TODO, ''],
      ['Сформировать матрицу типов/видов/категорий знаний', STAGE.s2, TODO, ''],
      ['Собрать источники и платформы, которым доверяем', STAGE.s2, TODO, ''],
      ['Собрать лучших экспертов по отраслям', STAGE.s2, TODO, ''],
      ['Составить алгоритм оценки доверия к информации', STAGE.s2, TODO, ''],
      ['Составить алгоритм поиска информации', STAGE.s3, TODO, ''],
      ['Изучить особенности поиска и уровни доступа моделей', STAGE.s3, TODO, ''],
      ['Определить формат и место хранения источников/данных', STAGE.s3, TODO, ''],
      ['Функционал углублённого исследования по авторам', STAGE.s4, TODO, ''],
      ['БД/БЗ для ранее найденной информации (дедупликация)', STAGE.s5, TODO, ''],
      ['Пайплайн: Декомпозиция → Прогон → Сбор информации', STAGE.s6, TODO, ''],
      ['Функционал дебатирования моделей за лучший ответ', STAGE.s7, TODO, ''],
      ['Процентная система расчёта лучшего ответа', STAGE.s7, TODO, ''],
    ],
  };
}

export const BASE_PRESETS: BasePreset[] = [
  implementationPreset(),
  roadmapPreset(),
  knowledgeMatrixPreset(),
  expertsPreset(),
];

/** The default grouping for a base: sort (asc) by the first column that asks to
    be the default grouping. Undefined when none does. */
export function defaultGroupSort(columns: Array<Pick<ColumnDef, 'key' | 'defaultGroup'>>): ListParams['sort'] | undefined {
  const col = columns.find((c) => c.defaultGroup);
  return col ? { key: col.key, dir: 'asc' } : undefined;
}
