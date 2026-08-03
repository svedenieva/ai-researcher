// Реестр «баз знаний». Пока каждая база — это срез общего каталога продуктов
// по разделу (section). «Рынок AI» — весь каталог; остальные три фиксируют
// section. Это даёт мультибазу и 4 отдельных раздела, которые просил Александр,
// без разрушения текущих данных. Следующий шаг (цель №1) — базы со своей
// таблицей и своими колонками, создаваемые из UI; структура под это готова.

export interface BaseDef {
  /** url-слаг базы */
  id: string;
  /** название в переключателе и заголовке */
  name: string;
  /** цвет точки в табе: sage | teal | blue | amber */
  tone: 'sage' | 'teal' | 'blue' | 'amber';
  /** фиксированный раздел каталога; null = весь рынок */
  section: string | null;
  /** подзаголовок витрины для этой базы */
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
