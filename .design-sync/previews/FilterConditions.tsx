import { FilterConditions } from 'ai-researcher';
import { COLUMNS, AutoOpen, noop } from '../fixtures';

const EMPTY = { match: 'all', items: [] };
const TWO = {
  match: 'all',
  items: [
    { key: 'verdict', op: 'eq', value: 'Берём' },
    { key: 'rating', op: 'gte', value: '4' },
  ],
};

/** Конструктор с двумя условиями — счётчик на триггере показывает «2». */
export const WithConditions = () => (
  <AutoOpen>
    <FilterConditions columns={COLUMNS as never} model={TWO as never} onChange={noop} lang="ru" />
  </AutoOpen>
);

/** Пустой фильтр: набор операторов подставляется по типу колонки. */
export const Empty = () => (
  <AutoOpen>
    <FilterConditions columns={COLUMNS as never} model={EMPTY as never} onChange={noop} lang="ru" />
  </AutoOpen>
);

/** Закрытый триггер со счётчиком активных условий. */
export const Trigger = () => (
  <FilterConditions columns={COLUMNS as never} model={TWO as never} onChange={noop} lang="ru" />
);
