import { SavedViews } from 'ai-researcher';
import { PanelStage, noop } from '../fixtures';

const SORT = { key: 'rating', dir: 'desc' };
const FILTERS = { verdict: 'Берём' };

/** Раскрытый список: сохранить текущий вид или применить сохранённый. */
export const Opened = () => (
  <PanelStage width={400} height={260}>
    <SavedViews
      base="agents"
      sort={SORT as never}
      extraLevels={[]}
      filters={FILTERS}
      search=""
      onApply={noop}
    />
  </PanelStage>
);

/** Закрытый триггер рядом с сортировкой и фильтром. */
export const Trigger = () => (
  <SavedViews base="agents" sort={SORT as never} extraLevels={[]} filters={FILTERS} search="" onApply={noop} />
);
