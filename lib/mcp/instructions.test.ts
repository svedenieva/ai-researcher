import { describe, it, expect } from 'vitest';
// @ts-expect-error — shared rules text lives in a JS module (one copy for stdio + HTTP)
import { INSTRUCTIONS } from './instructions.mjs';

// §9 of the acceptance criteria: Claude must check the base before a new search
// and only ADD new data, not re-research what's already there.
describe('MCP instructions — base-first gate (§9)', () => {
  it('names query_records as the pre-search check on the target base', () => {
    expect(INSTRUCTIONS).toContain('query_records');
  });

  it('requires the base check BEFORE any external/web search', () => {
    expect(INSTRUCTIONS).toMatch(/query_records[\s\S]*before[\s\S]*search/i);
  });

  it('says to add only NEW data, not re-research what the base already holds', () => {
    expect(INSTRUCTIONS).toMatch(/only new/i);
  });
});

// §5.8: the «AI-сфера» base (id "ai") is pinned as the Researcher's RAG store —
// retrieve from it first, and file new AI research beneath it (§5.1).
describe('MCP instructions — AI-сфера RAG role (§5.8)', () => {
  it('names AI-сфера / "ai" as the knowledge base to retrieve from', () => {
    expect(INSTRUCTIONS).toMatch(/AI-сфера[\s\S]*knowledge base|knowledge base[\s\S]*ai/i);
    expect(INSTRUCTIONS).toContain('query_records');
  });

  it('files new AI research as a child base under parent "ai"', () => {
    expect(INSTRUCTIONS).toMatch(/parent "ai"/);
  });
});
