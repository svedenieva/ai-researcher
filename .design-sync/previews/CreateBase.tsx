import { CreateBase } from 'ai-researcher';
import { PARENTS, noop } from '../fixtures';

/** Мастер создания базы: имя, родитель, пресет колонок, импорт таблицы. */
export const Default = () => (
  <CreateBase onCancel={noop} onCreated={noop} parents={PARENTS as never} />
);

/** Открыт из узла дерева по «+» — родитель уже выбран. */
export const WithParentPreselected = () => (
  <CreateBase onCancel={noop} onCreated={noop} parents={PARENTS as never} initialParent="ai" />
);

/** Без родителей — базу заводят в корне витрины. */
export const AtRoot = () => <CreateBase onCancel={noop} onCreated={noop} />;
