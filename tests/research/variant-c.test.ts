import { describe, it, expect, vi, beforeEach } from 'vitest';

// End-to-end of the parts of Variant C that WE own: start a run → the connector
// writes the result into the run base → the site reads it back. The only link
// not covered is the user's own Claude actually doing the search, which is
// external by design; everything on our side is exercised here.

vi.mock('@/lib/current-user', () => ({ currentEmail: async () => 'alice@example.com' }));

import { POST as startPOST } from '@/app/api/research/start/route';
import { POST as mcpPOST } from '@/app/api/mcp/route';
import { GET as recordsGET } from '@/app/api/records/route';
import { getCustomStore } from '@/lib/datasource/customStore';
import { RUNS_FOLDER, RUN_PREFIX } from '@/lib/research/runs';

const ALICE = 'alice@example.com';
beforeEach(() => { process.env.MCP_TOKENS = `tok-alice:${ALICE}`; });

const startRun = (prompt: string) =>
  startPOST(new Request('http://localhost/api/research/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
  }));

function connectorCall(name: string, args: Record<string, unknown>) {
  return mcpPOST(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer tok-alice' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
}

describe('Variant C — старт исследования', () => {
  it('создаёт приватную run-базу под папкой «Исследования» с посевными колонками', async () => {
    const body = await (await startRun('AI-агенты для видеомонтажа')).json();
    expect(body.baseId).toBeTruthy();
    expect(String(body.baseName)).toContain(RUN_PREFIX);

    const base = await getCustomStore().getBase(body.baseId);
    expect(base).toBeTruthy();
    expect(base!.owner).toBe(ALICE);
    const labels = base!.columns.map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(['Название', 'Цитата', 'Источники']));

    // run is filed under the person's folder, not loose at the root
    const parent = await getCustomStore().getBase(base!.parent!);
    expect(parent!.name).toBe(RUNS_FOLDER);
  });

  it('возвращает дилинк, который велит Claude идти в реестр и требовать цитату', async () => {
    const body = await (await startRun('рынок ИИ-инструментов')).json();
    expect(String(body.web).startsWith('https://claude.ai/new?q=')).toBe(true);
    expect(body.instruction).toContain(body.baseId);
    expect(body.instruction).toContain('list_trusted_sources');
    expect(body.instruction).toMatch(/VERBATIM quote/);
  });

  it('пустой запрос отклоняется', async () => {
    expect((await startRun('   ')).status).toBe(400);
  });
});

describe('Variant C — коннектор пишет, сайт читает', () => {
  it('строка, сохранённая через add_rows, читается обратно через /api/records', async () => {
    const started = await (await startRun('open-source LLM')).json();
    const baseId = started.baseId as string;

    // the user's Claude would call this after its search
    const add = await (await connectorCall('add_rows', {
      base: baseId,
      rows: [{
        'Название': 'Llama 3',
        'Цитата': 'Llama 3 is openly available for research and commercial use.',
        'Источники': 'https://ai.meta.com/blog/meta-llama-3/',
      }],
    })).json();
    expect(JSON.parse(add.result.content[0].text).added).toBe(1);

    // the site reads the run base back
    const read = await (await recordsGET(new Request(`http://localhost/api/records?base=${baseId}`))).json();
    const row = read.records.find((r: Record<string, unknown>) => r['название'] === 'Llama 3');
    expect(row).toBeTruthy();
    expect(String(row['цитата'])).toContain('openly available');
    expect(String(row['источники'])).toContain('ai.meta.com');
  });

  it('нельзя писать в чужую приватную run-базу', async () => {
    // a run owned by someone else
    const bob = await getCustomStore().createBase({
      name: `${RUN_PREFIX} чужое`, columns: [{ key: 'название', label: 'Название', type: 'text' }], owner: 'bob@example.com',
    });
    const res = await (await connectorCall('add_rows', { base: bob.id, rows: [{ 'Название': 'взлом' }] })).json();
    const text = res.result.content[0].text as string;
    expect(text.startsWith('Error:')).toBe(true);
    expect((await getCustomStore().listRecords(bob.id)).length).toBe(0);
  });
});
