import { BaseTree } from 'ai-researcher';
import { TABS, noop } from '../fixtures';

/** Встроенная панель: дерево баз с тонами веток и операциями над узлом. */
export const Embedded = () => (
  <div style={{ maxWidth: 320 }}>
    <BaseTree
      tabs={TABS as never}
      base="agents-code"
      onPick={noop}
      onClose={noop}
      onCreate={noop}
      embedded
    />
  </div>
);

/** Раскрыто на другой ветке — фокус задаётся пропом focus. */
export const FocusedElsewhere = () => (
  <div style={{ maxWidth: 320 }}>
    <BaseTree
      tabs={TABS as never}
      base="agents-code"
      focus="infra"
      onPick={noop}
      onClose={noop}
      onCreate={noop}
      embedded
    />
  </div>
);
