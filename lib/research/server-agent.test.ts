import { describe, it, expect } from 'vitest';
import { serverAgentStatus, pluckSavedRows, dedupeRows, runServerResearch } from './server-agent';

describe('server-agent — the flag', () => {
  it('is off unless both key and RESEARCH_SERVER_AGENT=1 are set', () => {
    expect(serverAgentStatus({}).enabled).toBe(false);
    expect(serverAgentStatus({ ANTHROPIC_API_KEY: 'k' }).enabled).toBe(false);
    expect(serverAgentStatus({ RESEARCH_SERVER_AGENT: '1' }).enabled).toBe(false);
  });

  it('is on only with both', () => {
    const s = serverAgentStatus({ ANTHROPIC_API_KEY: 'k', RESEARCH_SERVER_AGENT: '1' });
    expect(s.enabled).toBe(true);
  });
});

describe('server-agent — pluckSavedRows', () => {
  it('pulls rows from save_rows tool_use blocks, ignoring other blocks', () => {
    const content = [
      { type: 'text', text: 'thinking...' },
      { type: 'tool_use', name: 'web_search', id: 'a', input: { query: 'x' } },
      {
        type: 'tool_use',
        name: 'save_rows',
        id: 'b',
        input: { rows: [{ name: 'Synthesia', quote: 'AI videos', source: 'https://synthesia.io' }] },
      },
    ];
    const rows = pluckSavedRows(content);
    expect(rows).toEqual([{ name: 'Synthesia', quote: 'AI videos', source: 'https://synthesia.io' }]);
  });

  it('tolerates russian keys and missing fields', () => {
    const rows = pluckSavedRows([
      { type: 'tool_use', name: 'save_rows', id: 'c', input: { rows: [{ 'название': 'HeyGen', url: 'https://heygen.com' }] } },
    ]);
    expect(rows[0].name).toBe('HeyGen');
    expect(rows[0].source).toBe('https://heygen.com');
    expect(rows[0].quote).toBe('');
  });

  it('returns nothing for empty / missing content', () => {
    expect(pluckSavedRows(undefined)).toEqual([]);
    expect(pluckSavedRows([])).toEqual([]);
  });
});

describe('server-agent — dedupeRows', () => {
  it('drops nameless rows and case-insensitive duplicates, keeping the first', () => {
    const rows = dedupeRows([
      { name: 'Runway', quote: 'first', source: 'a' },
      { name: 'runway', quote: 'dup', source: 'b' },
      { name: '  ', quote: 'blank', source: 'c' },
      { name: 'Pika', quote: 'x', source: 'd' },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Runway', 'Pika']);
    expect(rows[0].quote).toBe('first');
  });
});

describe('server-agent — runServerResearch guard', () => {
  it('does nothing (no fetch, no writes) when the flag is off', async () => {
    let fetched = false;
    const fetchImpl = (async () => { fetched = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
    const store = { addRecords: async () => 0 } as unknown as import('@/lib/datasource/customStore').CustomStore;
    const r = await runServerResearch({ topic: 'x', baseId: 'b', store, env: {}, fetchImpl });
    expect(r.ok).toBe(false);
    expect(fetched).toBe(false);
    expect(r.added).toBe(0);
  });
});
