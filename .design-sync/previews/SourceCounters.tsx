import { SourceCounters } from 'ai-researcher';
import { COLUMNS, RECORDS } from '../fixtures';

/** Покрытие по видам источников против норматива (эксперты 10, репозитории 20). */
export const Default = () => (
  <SourceCounters records={RECORDS as never} columns={COLUMNS as never} lang="ru" />
);

/** Слабо наполненное направление — видно, до чего именно не дотягивает. */
export const Sparse = () => (
  <SourceCounters records={RECORDS.slice(0, 3) as never} columns={COLUMNS as never} lang="ru" />
);
