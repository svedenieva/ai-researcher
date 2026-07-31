import type { CatalogRecord } from './types';

// Раздел каталога выводится из вертикали. Первый черновик разбивки —
// поменять группировку можно здесь одной строкой (согласовать с Александром).
const SECTION_BY_VERTICAL: Record<string, string> = {
  // IT — разработка / девтулзы
  coding: 'IT',
  // AI — модели, агенты, генеративка, данные
  opensource: 'AI',
  video: 'AI',
  design: 'AI',
  'agent-platform': 'AI',
  data: 'AI',
  'reddit-gem': 'AI',
  'agent-observability': 'AI',
  'agent-infra': 'AI',
  'agent-orchestration': 'AI',
  // WorkOS — автоматизация бизнес-процессов
  support: 'WorkOS',
  marketing: 'WorkOS',
  sales: 'WorkOS',
  management: 'WorkOS',
  legaltech: 'WorkOS',
  hr: 'WorkOS',
  healthtech: 'WorkOS',
  fintech: 'WorkOS',
  logistics: 'WorkOS',
  agtech: 'WorkOS',
  proptech: 'WorkOS',
  insurance: 'WorkOS',
  edtech: 'WorkOS',
  ecommerce: 'WorkOS',
};

export function sectionFor(vertical: unknown): string | null {
  if (typeof vertical !== 'string') return null;
  return SECTION_BY_VERTICAL[vertical] ?? null;
}

// Adds a derived `section` to each record (keeps an explicit one if present).
export function withSections(records: CatalogRecord[]): CatalogRecord[] {
  return records.map((r) => ({ ...r, section: r.section ?? sectionFor(r.vertical) }));
}
