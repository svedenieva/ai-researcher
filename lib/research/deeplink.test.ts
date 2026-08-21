import { describe, it, expect } from 'vitest';
import { researchInstruction, researchDeeplinks } from './deeplink';

describe('research deeplink (Variant C)', () => {
  it('the instruction contains the topic and the launch base id, and asks for add_rows', () => {
    const ins = researchInstruction('AI для видеомонтажа', 'иссл-123');
    // the prose is English, but the answer must come back in the question's language
    expect(ins).toContain('in the language of the question');
    expect(ins).toContain('AI для видеомонтажа');
    expect(ins).toContain('иссл-123');
    expect(ins).toContain('add_rows');
    expect(ins).toContain('catalog_search');
  });

  it('deeplink: web is a universal link, desktop is the claude:// scheme, q is encoded', () => {
    const { web, desktop, instruction } = researchDeeplinks('тема', 'base-1');
    expect(web.startsWith('https://claude.ai/new?q=')).toBe(true);
    expect(desktop.startsWith('claude://claude.ai/new?q=')).toBe(true);
    // q is URL-encoded, without raw spaces/quotes
    const q = web.split('?q=')[1];
    expect(q).not.toContain(' ');
    expect(decodeURIComponent(q)).toBe(instruction);
  });

  it('the prompt fits within the q limit (~14000 characters)', () => {
    const { instruction } = researchDeeplinks('x'.repeat(200), 'b');
    expect(instruction.length).toBeLessThan(14000);
  });
  // A link is cheap to invent; a verbatim quote that survives a search of the
  // page is not. The instruction must keep demanding both, or the human check
  // gets expensive again and stops happening.
  it('demands a primary source AND a verbatim quote for every row', () => {
    const ins = researchInstruction('тема', 'b');
    expect(ins).toContain('primary source');
    expect(ins).toMatch(/VERBATIM quote/);
    expect(ins).toContain('If you cannot quote it, do not add the row');
    // the column names stay verbatim even though the prose is English — they are
    // the real labels of the seeded columns, and Claude matches rows on them
    expect(ins).toContain('«Цитата»');
    expect(ins).toContain('«Источники»');
  });
});
