// Design-sync entry — the component surface the AI Researcher site exposes to
// Claude Design. Hand-written on purpose: the repo is a Next.js app, not a
// published library, so there is no dist/ to bundle. Route files under app/
// are deliberately absent — they import next/link and next/navigation, which
// have no meaning outside the Next runtime.
//
// Everything re-exported here lands on window.AiResearcherDS.*.

// -- providers ---------------------------------------------------------------
export { DsProvider } from './ds-provider';
export { LangProvider, useLang } from '../app/lang-provider';
export { UiProvider, useToast, useConfirm } from '../app/ui';

// -- navigation --------------------------------------------------------------
export { default as BasePicker } from '../app/base-picker';
export { default as BaseTree } from '../app/base-tree';
export { default as GlobalSearch } from '../app/global-search';
export { default as SavedViews } from '../app/saved-views';
export { default as Shortcuts } from '../app/shortcuts';

// -- knowledge ---------------------------------------------------------------
export { default as KnowledgeCards } from '../app/knowledge-cards';
export { default as BaseSummary } from '../app/base-summary';
export { default as SourceCounters } from '../app/source-counters';
export { default as StagesPanel } from '../app/stages-panel';
export { default as ConfirmationsPanel } from '../app/confirmations-panel';

// -- forms & actions ---------------------------------------------------------
export { default as CreateBase } from '../app/create-base';
export { default as FilterConditions } from '../app/filter-conditions';
export { default as BaseAccess } from '../app/base-access';
export { default as BaseAiActions } from '../app/base-ai-actions';

// -- chrome ------------------------------------------------------------------
export { default as ThemeToggle } from '../app/theme-toggle';
export { default as LangSwitch } from '../app/lang-switch';

// -- icons -------------------------------------------------------------------
// All 27 icons reach the global individually so the design agent can compose
// with them; IconGallery is the single browsable card for humans.
export * from '../app/icons';
export { IconGallery } from './icons/icon-gallery';
