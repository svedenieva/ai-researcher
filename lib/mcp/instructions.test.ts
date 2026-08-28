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
