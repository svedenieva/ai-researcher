import { KnowledgeCards } from 'ai-researcher';
import { COLUMNS, RECORDS, noop } from '../fixtures';

/** Полная выкладка базы «AI-агенты»: имя, вертикаль-бейдж, ключевые поля. */
export const Default = () => (
  <KnowledgeCards records={RECORDS as never} columns={COLUMNS as never} lang="ru" onOpen={noop} />
);

/** Тот же набор в другом тоне — цвет-акцент задаётся базой, а не карточкой. */
export const TealTone = () => (
  <KnowledgeCards records={RECORDS.slice(0, 6) as never} columns={COLUMNS as never} lang="ru" tone="teal" onOpen={noop} />
);

/** Украинская локаль — на ней продукт открывается по умолчанию. */
export const Ukrainian = () => (
  <KnowledgeCards records={RECORDS.slice(0, 6) as never} columns={COLUMNS as never} lang="uk" onOpen={noop} />
);
