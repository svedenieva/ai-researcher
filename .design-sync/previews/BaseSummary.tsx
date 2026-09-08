import { BaseSummary } from 'ai-researcher';
import { COLUMNS, RECORDS } from '../fixtures';

/** Метрики базы: воронка по «Вердикту», средняя оценка, заполненность. */
export const Default = () => <BaseSummary columns={COLUMNS as never} records={RECORDS as never} />;

/** С общим числом записей — когда на экране только страница из выборки. */
export const WithTotal = () => (
  <BaseSummary columns={COLUMNS as never} records={RECORDS as never} total={148} />
);
