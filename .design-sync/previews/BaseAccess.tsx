import { BaseAccess } from 'ai-researcher';
import { PanelStage } from '../fixtures';

/** Раскрытая выдача доступа: кто уже приглашён и поле для нового адреса. */
export const Opened = () => (
  <PanelStage width={460} height={280}>
    <BaseAccess baseId="agents" lang="ru" />
  </PanelStage>
);

/** Закрытый триггер в шапке базы. */
export const Trigger = () => <BaseAccess baseId="agents" lang="ru" />;
