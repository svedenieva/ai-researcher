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

export const BASE_PRESETS: BasePreset[] = [implementationPreset()];

/** The default grouping for a base: sort (asc) by the first column that asks to
    be the default grouping. Undefined when none does. */
export function defaultGroupSort(columns: Array<Pick<ColumnDef, 'key' | 'defaultGroup'>>): ListParams['sort'] | undefined {
  const col = columns.find((c) => c.defaultGroup);
  return col ? { key: col.key, dir: 'asc' } : undefined;
}
