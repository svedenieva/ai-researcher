import { StagesPanel } from 'ai-researcher';
import { COLUMNS, RECORDS, PanelStage } from '../fixtures';

/** Отчёт по стадиям: сколько записей на каждой и средний возраст записи. */
export const Opened = () => (
  <PanelStage width={460} height={300}>
    <StagesPanel records={RECORDS as never} columns={COLUMNS as never} lang="ru" />
  </PanelStage>
);

/** Закрытый триггер — так панель стоит в панели инструментов базы. */
export const Trigger = () => (
  <StagesPanel records={RECORDS as never} columns={COLUMNS as never} lang="ru" />
);
