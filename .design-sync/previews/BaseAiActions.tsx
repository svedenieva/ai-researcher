import { BaseAiActions } from 'ai-researcher';
import { COLUMNS, PanelStage } from '../fixtures';

/** Меню ИИ-действий: спросить, найти пробелы, обобщить, заполнить колонку. */
export const Opened = () => (
  <PanelStage width={420} height={320}>
    <BaseAiActions baseId="agents" baseName="AI-агенты" columns={COLUMNS as never} />
  </PanelStage>
);

/** Без колонок — пункта «заполнить колонку» нечем наполнить. */
export const NoColumns = () => (
  <PanelStage width={420} height={280}>
    <BaseAiActions baseId="agents" baseName="AI-агенты" />
  </PanelStage>
);

/** Закрытый триггер. */
export const Trigger = () => (
  <BaseAiActions baseId="agents" baseName="AI-агенты" columns={COLUMNS as never} />
);
