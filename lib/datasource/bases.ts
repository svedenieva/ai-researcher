// Registry of "knowledge bases". For now each base is a slice of the shared product
// catalog by section. «Рынок AI» is the whole catalog; the other three fix a
// section. This gives the multi-base and 4 separate sections the boss asked for,
// without breaking the current data. The next step (goal #1) — bases with their own
// table and their own columns, created from the UI; the structure is ready for it.

export interface BaseDef {
  /** url slug of the base */
  id: string;
  /** name in the switcher and the title */
  name: string;
  /** dot color in the tab: sage | teal | blue | amber */
  tone: 'sage' | 'teal' | 'blue' | 'amber';
  /** fixed catalog section; null = the whole market */
  section: string | null;
  /** the showcase subheading for this base */
  blurb: string;
}

export const BASES: BaseDef[] = [
  {
    id: 'market',
    name: 'Рынок AI',
    tone: 'sage',
    section: null,
    blurb: 'Живая витрина AI-рынка — все продукты и конкуренты в одном месте.',
  },
  {
    id: 'ai',
    name: 'AI-сфера',
    tone: 'teal',
    section: 'AI',
    blurb: 'Модели, агенты, генеративка и данные — ядро AI-сферы.',
  },
  {
    id: 'it',
    name: 'IT-сфера',
    tone: 'blue',
    section: 'IT',
    blurb: 'Разработка и девтулзы — что использовать в инженерии.',
  },
  {
    id: 'workforce',
    name: 'Workforce',
    tone: 'amber',
    section: 'WorkOS',
    blurb: 'Автоматизация бизнес-процессов — продукты для операционки.',
  },
];

export const DEFAULT_BASE = 'market';

export function baseById(id?: string | null): BaseDef {
  return BASES.find((b) => b.id === id) ?? BASES[0];
}
