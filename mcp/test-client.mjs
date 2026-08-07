import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const env = Object.fromEntries(
  readFileSync('../.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['server.mjs'],
  env: { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_KEY, PATH: process.env.PATH },
});
const client = new Client({ name: 'test', version: '1.0.0' });
await client.connect(transport);

const tools = await client.listTools();
console.log('TOOLS:', tools.tools.map((t) => t.name).join(', '));

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args ?? {} });
  const text = r.content?.[0]?.text ?? '';
  console.log(`\n--- ${name}(${JSON.stringify(args ?? {})}) ---`);
  console.log(text.length > 700 ? text.slice(0, 700) + '…' : text);
};

await call('list_bases');
await call('catalog_search', { query: 'video', section: 'AI', limit: 3 });
await call('research_decompose', { prompt: 'AI агенты для продаж' });
await call('create_base', {
  name: 'MCP smoke',
  columns: [{ label: 'Name', type: 'text' }, { label: 'Score', type: 'number' }],
  rows: [{ Name: 'Alpha', Score: '9' }, { Name: 'Beta', Score: '7' }],
});
await call('query_records', { base: 'mcp-smoke' });

// ── Task 1: get_base schema visibility ──
const created = await client.callTool({ name: 'create_base', arguments: { name: 'MCP Test Base', columns: [{ label: 'Название' }, { label: 'Цена', type: 'number' }] } });
const baseId = JSON.parse(created.content[0].text).id;
const schema = JSON.parse((await client.callTool({ name: 'get_base', arguments: { base: baseId } })).content[0].text);
console.assert(schema.columns.length === 2, 'get_base returns columns');
console.assert(schema.columns[0].type && schema.columns[0].key, 'columns carry type+key');

// ── Task 2: add/update/delete column ──
await client.callTool({ name: 'add_rows', arguments: { base: baseId, rows: [{ 'Название': 'Figma', 'Цена': 15 }] } });
await client.callTool({ name: 'add_column', arguments: { base: baseId, label: 'Заметка' } });
let s = JSON.parse((await client.callTool({ name: 'get_base', arguments: { base: baseId } })).content[0].text);
console.assert(s.columns.some((c) => c.key === 'заметка'), 'add_column worked');
await client.callTool({ name: 'update_column', arguments: { base: baseId, key: 'заметка', label: 'Примечание' } });
s = JSON.parse((await client.callTool({ name: 'get_base', arguments: { base: baseId } })).content[0].text);
console.assert(s.columns.find((c) => c.key === 'заметка').label === 'Примечание', 'update_column changes label, keeps key');
await client.callTool({ name: 'delete_column', arguments: { base: baseId, key: 'цена' } });
const recs = JSON.parse((await client.callTool({ name: 'query_records', arguments: { base: baseId } })).content[0].text);
console.assert(recs.records[0].цена === 15, 'delete_column keeps underlying cell data');

// ── Task 3: rename/move + delete_base → bin ──
await client.callTool({ name: 'rename_base', arguments: { base: baseId, name: 'MCP Test Base 2' } });
await client.callTool({ name: 'delete_base', arguments: { base: baseId } });
const listed = JSON.parse((await client.callTool({ name: 'list_bases', arguments: {} })).content[0].text);
console.assert(!listed.bases.some((b) => b.id === baseId), 'deleted base hidden from list_bases');

await client.close();
process.exit(0);
