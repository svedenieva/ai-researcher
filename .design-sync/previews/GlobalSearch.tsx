import { GlobalSearch } from 'ai-researcher';
import { noop } from '../fixtures';

/** Поле поиска по всем базам. Запрос уходит от двух символов. */
export const Default = () => (
  <div style={{ maxWidth: 420 }}>
    <GlobalSearch onNavigate={noop} />
  </div>
);
