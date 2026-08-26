import { describe, it, expect } from 'vitest';
import { askBase, findGaps, summarize } from './base-actions';

describe('base AI actions (Variant C over an existing base)', () => {
  it('askBase carries the base id, name, question and a connector read call', () => {
    const l = askBase('base-1', 'Мій ринок', 'хто лідери?');
    expect(l.web.startsWith('https://claude.ai/new?q=')).toBe(true);
    expect(l.desktop.startsWith('claude://claude.ai/new?q=')).toBe(true);
    expect(l.instruction).toContain('base-1');
    expect(l.instruction).toContain('Мій ринок');
    expect(l.instruction).toContain('хто лідери?');
    expect(l.instruction).toMatch(/get_base|query_records/);
    // q is URL-encoded — no raw spaces/quotes leak into the link
    expect(l.web.split('?q=')[1]).not.toContain(' ');
  });

  it('findGaps and summarize read the base and never write to it', () => {
    for (const l of [findGaps('b7', 'N'), summarize('b7', 'N')]) {
      expect(l.instruction).toContain('b7');
      expect(l.instruction).toMatch(/get_base|query_records/);
      // read-only: must not invoke any write tool
      expect(l.instruction).not.toMatch(/add_rows|update_record|add_column|delete_/);
    }
    expect(findGaps('b7', 'N').instruction).toMatch(/missing|under-covered|gap/i);
    expect(summarize('b7', 'N').instruction).toMatch(/summary|takeaway|trend/i);
  });
});
