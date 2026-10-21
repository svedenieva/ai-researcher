import { BasePicker } from 'ai-researcher';
import { TABS, noop } from '../fixtures';

/** Крошки на вложенной базе: AI → AI-агенты → Кодинг-агенты. */
export const Nested = () => (
  <BasePicker tabs={TABS as never} base="agents-code" onChange={noop} onCreate={noop} />
);

/** Верхний уровень — путь короткий, виден корневой ярлык. */
export const AtRoot = () => (
  <BasePicker tabs={TABS as never} base="ai" onChange={noop} onCreate={noop} />
);

/** Свой ярлык корня — когда витрина называется иначе. */
export const CustomRootLabel = () => (
  <BasePicker tabs={TABS as never} base="agents" onChange={noop} onCreate={noop} rootLabel="AiVocado" />
);
