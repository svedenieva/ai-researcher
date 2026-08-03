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

await client.close();
process.exit(0);
