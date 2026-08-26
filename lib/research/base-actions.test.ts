import { describe, it, expect } from 'vitest';
import { askBase, findGaps, summarize, fillColumn } from './base-actions';

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
    // gaps consults the user's OTHER bases before treating something as a gap
    expect(findGaps('b7', 'N').instruction).toMatch(/list_bases/);
    expect(findGaps('b7', 'N').instruction).toMatch(/other bases/i);
  });

  it('fillColumn writes only the chosen column of empty cells, sourced, never invented', () => {
    const l = fillColumn('base-9', 'Ринок', 'Ціна');
    expect(l.instruction).toContain('base-9');
    expect(l.instruction).toContain('Ціна');
    expect(l.instruction).toMatch(/update_record/);
    expect(l.instruction).toMatch(/empty/i);
    expect(l.instruction).toMatch(/never invent|do not invent/i);
    // touches only the named column
    expect(l.instruction).toMatch(/only «Ціна»|ONLY «Ціна»/);
    // pulls from the user's other bases before hitting the open web
    expect(l.instruction).toMatch(/list_bases/);
    expect(l.instruction).toMatch(/before searching the open web/i);
  });
});
