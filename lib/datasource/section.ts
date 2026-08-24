import type { CatalogRecord, Cell } from './types';

// The catalog section is derived from the vertical. First draft of the split —
// the grouping can be changed here in one line.
const SECTION_BY_VERTICAL: Record<string, string> = {
  // IT — development / devtools
  coding: 'IT',
  // AI — models, agents, generative, data
  opensource: 'AI',
  video: 'AI',
  design: 'AI',
  'agent-platform': 'AI',
  data: 'AI',
  'reddit-gem': 'AI',
  'agent-observability': 'AI',
  'agent-infra': 'AI',
  'agent-orchestration': 'AI',
  // WorkOS — business-process automation
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

// Strip a leading emoji (+ optional variation selector and spaces) from a badge
// value: "🟢 Строить своё" → "Строить своё". Values with no leading emoji
// ("E1 · подтверждено") pass through unchanged. Applied to the two catalog
// fields that carry emoji, so the grid shows clean labels — the badge colours
// and filters still match because the config keys are stripped the same way.
function stripEmoji(v: Cell): Cell {
  if (typeof v !== 'string') return v;
  return v.replace(/^\p{Extended_Pictographic}️?\s*/u, '');
}

// Adds a derived `section` to each record (keeps an explicit one if present),
// and cleans the emoji off the verdict / popularity badge values.
export function withSections(records: CatalogRecord[]): CatalogRecord[] {
  return records.map((r) => ({
    ...r,
    section: r.section ?? sectionFor(r.vertical),
    verdict: stripEmoji(r.verdict),
    pop: stripEmoji(r.pop),
  }));
}
