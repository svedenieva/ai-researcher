#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function loadEnv() {
  const envPath = '../.env.local';

  const result = {};

  for (
    const line of readFileSync(envPath, 'utf8').split(/\r?\n/)
  ) {
    if (!line || line.startsWith('#')) {
      continue;
    }

    const i = line.indexOf('=');

    if (i === -1) {
      continue;
    }

    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();

    result[key] = value;
  }

  return result;
}

const env = loadEnv();

const transport = new StdioClientTransport({
  command: process.execPath,

  args: ['server.mjs'],

  env: {
    ...process.env,

    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_KEY,

    PATH: process.env.PATH,
  },
});

const client = new Client({
  name: 'ai-researcher-test-client',
  version: '1.0.0',
});

console.log('Connecting to ai-researcher MCP server...');

await client.connect(transport);

console.log('Connected.\n');


async function call(name, args = {}) {
  console.log('========================================');
  console.log(`TOOL: ${name}`);
  console.log('========================================');

  console.log('Arguments:');
  console.log(JSON.stringify(args, null, 2));

  const result = await client.callTool({
    name,
    arguments: args,
  });

  const text =
    result.content?.[0]?.text ?? '';

  console.log('\nResult:');

  console.log(
    text.length > 3000
      ? text.slice(0, 3000) + '\n... output truncated ...'
      : text,
  );

  console.log();

  return result;
}


// --------------------------------------------------
// 1. LIST TOOLS
// --------------------------------------------------

const tools = await client.listTools();

console.log('========================================');
console.log('TOOLS');
console.log('========================================');

for (const tool of tools.tools) {
  console.log(`- ${tool.name}`);
}

console.log();


// --------------------------------------------------
// 2. LIST PROMPTS
// --------------------------------------------------

const prompts = await client.listPrompts();

console.log('========================================');
console.log('PROMPTS');
console.log('========================================');

for (const prompt of prompts.prompts) {
  console.log(`- ${prompt.name}`);
}

console.log();


// --------------------------------------------------
// 3. LIST BASES
// --------------------------------------------------

await call('list_bases');


// --------------------------------------------------
// 4. SEARCH CATALOG
// --------------------------------------------------

await call('catalog_search', {
  query: 'video',
  section: 'AI',
  limit: 3,
});


// --------------------------------------------------
// 5. RESEARCH DECOMPOSITION
// --------------------------------------------------

await call('research_decompose', {
  prompt: 'AI агенты для продаж',
});


// --------------------------------------------------
// 6. CREATE A UNIQUE TEST BASE
// --------------------------------------------------

// IMPORTANT:
// Every run gets a different name.
// This prevents duplicate primary-key errors.

const uniqueName =
  `MCP Test ${Date.now()}-${randomUUID().slice(0, 8)}`;

const createResult = await call(
  'create_base',
  {
    name: uniqueName,

    columns: [
      {
        label: 'Название',
        type: 'text',
      },

      {
        label: 'Цена',
        type: 'number',
      },
    ],

    rows: [
      {
        Название: 'Alpha',
        Цена: '9',
      },

      {
        Название: 'Beta',
        Цена: '7',
      },
    ],
  },
);

const createText =
  createResult.content?.[0]?.text ?? '';

if (createResult.isError) {
  console.error(
    '\nCREATE BASE FAILED:',
    createText,
  );

  await client.close();
  process.exit(1);
}

const createdBase =
  JSON.parse(createText);

const baseId =
  createdBase.id;

console.log(
  `Created test base: ${baseId}\n`,
);


// --------------------------------------------------
// 7. GET BASE
// --------------------------------------------------

await call('get_base', {
  base: baseId,
});


// --------------------------------------------------
// 8. QUERY RECORDS
// --------------------------------------------------

await call('query_records', {
  base: baseId,
});


// --------------------------------------------------
// 9. ADD COLUMN
// --------------------------------------------------

await call('add_column', {
  base: baseId,

  label: 'Заметка',

  type: 'text',
});


// --------------------------------------------------
// 10. UPDATE COLUMN
// --------------------------------------------------

await call('update_column', {
  base: baseId,

  key: 'заметка',

  label: 'Примечание',
});


// --------------------------------------------------
// 11. ADD ROW
// --------------------------------------------------

await call('add_rows', {
  base: baseId,

  rows: [
    {
      Название: 'Figma',

      Цена: 15,

      Примечание: 'Design tool',
    },
  ],
});


// --------------------------------------------------
// 12. SEARCH ROW
// --------------------------------------------------

await call('query_records', {
  base: baseId,

  search: 'Figma',
});


// --------------------------------------------------
// 13. UPDATE RECORD
// --------------------------------------------------

const recordsResult =
  await client.callTool({
    name: 'query_records',

    arguments: {
      base: baseId,
    },
  });

const recordsText =
  recordsResult.content?.[0]?.text ?? '';

const recordsData =
  JSON.parse(recordsText);

const firstRecord =
  recordsData.records?.[0];

if (firstRecord) {
  await call('update_record', {
    base: baseId,

    id: firstRecord.id,

    data: {
      Примечание: 'Updated by MCP',
    },
  });
}


// --------------------------------------------------
// 14. DELETE COLUMN
// --------------------------------------------------

await call('delete_column', {
  base: baseId,

  key: 'цена',
});


// --------------------------------------------------
// 15. RENAME BASE
// --------------------------------------------------

await call('rename_base', {
  base: baseId,

  name: `${uniqueName} Renamed`,
});


// --------------------------------------------------
// 16. SHOW BIN
// --------------------------------------------------

await call('list_bin');


// --------------------------------------------------
// 17. DELETE A ROW
// --------------------------------------------------

const currentResult =
  await client.callTool({
    name: 'query_records',

    arguments: {
      base: baseId,
    },
  });

const currentText =
  currentResult.content?.[0]?.text ?? '';

const currentData =
  JSON.parse(currentText);

const rowToDelete =
  currentData.records?.[0];

if (rowToDelete) {
  await call('delete_rows', {
    base: baseId,

    ids: [
      rowToDelete.id,
    ],
  });
}


// --------------------------------------------------
// 18. SHOW BIN AGAIN
// --------------------------------------------------

await call('list_bin');


// --------------------------------------------------
// 19. DELETE TEST BASE
// --------------------------------------------------

await call('delete_base', {
  base: baseId,
});


// --------------------------------------------------
// 20. SHOW BIN
// --------------------------------------------------

await call('list_bin');


// --------------------------------------------------
// 21. EMPTY TEST BASE FROM BIN
// --------------------------------------------------

await call('empty_bin', {
  base: baseId,
});


// --------------------------------------------------
// 22. FINISHED
// --------------------------------------------------

console.log('========================================');
console.log('TESTS FINISHED');
console.log('========================================');

await client.close();

process.exit(0);