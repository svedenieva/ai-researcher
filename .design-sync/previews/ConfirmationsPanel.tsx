import { ConfirmationsPanel } from 'ai-researcher';
import { COLUMNS, CONFIRMATION_ROWS, PanelStage } from '../fixtures';

/** Тезисы с числом независимых источников: что прошло порог, что нет. */
export const Opened = () => (
  <PanelStage width={520} height={380}>
    <ConfirmationsPanel records={CONFIRMATION_ROWS as never} columns={COLUMNS as never} lang="ru" />
  </PanelStage>
);

/** Закрытый триггер. */
export const Trigger = () => (
  <ConfirmationsPanel records={CONFIRMATION_ROWS as never} columns={COLUMNS as never} lang="ru" />
);
