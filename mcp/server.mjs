#!/usr/bin/env node

import {readFileSync,existsSync,} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  INSTRUCTIONS,
} from '../lib/mcp/instructions.mjs';
const SKILLS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  'skills',
);

function loadSkill(name) {
  const path = join(SKILLS_DIR, `${name}.md`);

  if (!existsSync(path)) {
    throw new Error(`MCP skill not found: ${path}`);
  }

  return readFileSync(path, 'utf8').trim();
}

function loadEnvFallback() {
  try {
    const p = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '.env.local',
    );

    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;

      const i = line.indexOf('=');
      if (i === -1) continue;

      const k = line.slice(0, i).trim();

      if (!process.env[k]) {
        process.env[k] = line.slice(i + 1).trim();
      }
    }
  } catch {
    // No .env.local file — use process.env.
  }
}

loadEnvFallback();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'ai-researcher-mcp: set SUPABASE_URL and SUPABASE_SERVICE_KEY',
  );
  process.exit(1);
}

const supa = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  {
    auth: {
      persistSession: false,
    },
  },
);

// SECTION MAPPING


const SECTION_BY_VERTICAL = {
  coding: 'IT',

  opensource: 'AI',
  video: 'AI',
  design: 'AI',
  'agent-platform': 'AI',
  data: 'AI',
  'reddit-gem': 'AI',
  'agent-observability': 'AI',
  'agent-infra': 'AI',
  'agent-orchestration': 'AI',

  support: 'WorkOS',
  marketing: 'WorkOS',
  sales: 'WorkOS',
  management: 'WorkOS',
  legaltech: 'WorkOS',
  hr: 'WorkOS',
  healthtech: 'WorkOS',
  fintech: 'WorkOS',
  logistics: 'WorkOS',
  agtech: 'WorkOS',
  proptech: 'WorkOS',
  insurance: 'WorkOS',
  edtech: 'WorkOS',
  ecommerce: 'WorkOS',
};

const sectionFor = (vertical) => (
  typeof vertical === 'string'
    ? SECTION_BY_VERTICAL[vertical] ?? null
    : null
);

// BUILT-IN BASES

const BUILTIN_BASES = [
  {
    id: 'market',
    name: 'AI Market',
    section: null,
  },
  {
    id: 'ai',
    name: 'AI vertical',
    section: 'AI',
  },
  {
    id: 'it',
    name: 'IT vertical',
    section: 'IT',
  },
  {
    id: 'workforce',
    name: 'Workforce',
    section: 'WorkOS',
  },
];

const BUILTIN_IDS = new Set(
  BUILTIN_BASES.map((base) => base.id),
);


// DATABASE HELPERS

async function liveBases() {
  let result = await supa
    .from('bases')
    .select('id, name, tone, columns, parent')
    .is('deleted_at', null)
    .order('created_at');

  if (
    result.error &&
    /deleted_at/.test(result.error.message)
  ) {
    result = await supa
      .from('bases')
      .select('id, name, tone, columns, parent')
      .order('created_at');
  }

  return result;
}

async function liveRecords(baseId) {
  let result = await supa
    .from('base_records')
    .select('id, data')
    .eq('base_id', baseId)
    .is('deleted_at', null)
    .order('created_at');

  if (
    result.error &&
    /deleted_at/.test(result.error.message)
  ) {
    result = await supa
      .from('base_records')
      .select('id, data')
      .eq('base_id', baseId)
      .order('created_at');
  }

  return result;
}


// ID / COLUMN HELPERS


function slugId(name, taken) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 24) || 'base';

  let id = base;
  let n = 1;

  while (taken.has(id)) {
    id = `${base}-${++n}`;
  }

  return id;
}

function normalizeColumns(input) {
  const cols = [];
  const used = new Set();

  for (const raw of input ?? []) {
    const label = String(raw?.label ?? '').trim();

    if (!label) continue;

    let key = label
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, '_')
      .replace(/(^_|_$)/g, '');

    if (!key) {
      key = `col${cols.length}`;
    }

    while (used.has(key)) {
      key = `${key}_`;
    }

    used.add(key);

    const type =
      ['number', 'url', 'long-text', 'select'].includes(raw?.type)
        ? raw.type
        : 'text';

    cols.push({
      key,
      label,
      type,
      sortable: true,
      filterable:
        Boolean(raw?.filterable) &&
        type !== 'long-text' &&
        type !== 'url',
    });
  }

  return cols;
}

function normalizeNewColumnMjs(col, existing) {
  const label = String(col?.label ?? '').trim();

  let key = label
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '_')
    .replace(/(^_|_$)/g, '');

  if (!key) {
    key = `col${existing.length}`;
  }

  const used = new Set(
    existing.map((column) => column.key),
  );

  while (used.has(key)) {
    key = `${key}_`;
  }

  const type =
    ['number', 'url', 'long-text', 'select'].includes(col?.type)
      ? col.type
      : 'text';

  return {
    key,
    label,
    type,
    sortable: true,
    filterable:
      Boolean(col?.filterable) &&
      type !== 'long-text' &&
      type !== 'url',
  };
}

function applyColumnPatchMjs(col, patch) {
  const type = patch?.type ?? col.type;

  const label =
    patch?.label !== undefined
      ? String(patch.label).trim() || col.label
      : col.label;

  const filterable =
    (patch?.filterable ?? col.filterable ?? false) &&
    type !== 'long-text' &&
    type !== 'url';

  return {
    ...col,
    label,
    type,
    filterable,
  };
}


// BASE VALIDATION


async function loadCustomBase(base) {
  if (BUILTIN_IDS.has(base)) {
    return {
      error: 'built-in bases are read-only',
    };
  }

  const { data, error } = await liveBases();

  if (error) {
    return {
      error: error.message,
    };
  }

  const found = (data ?? []).find(
    (item) => item.id === base,
  );

  if (!found) {
    return {
      error: 'base not found',
    };
  }

  return {
    base: found,
    columns: found.columns ?? [],
  };
}

async function assertLiveCustomBase(base) {
  if (BUILTIN_IDS.has(base)) {
    return {
      error: 'built-in bases are read-only',
    };
  }

  const result = await loadCustomBase(base);

  if (result.error) {
    return result;
  }

  return {
    base: result.base,
    columns: result.columns,
  };
}

async function saveColumns(base, columns) {
  const { error } = await supa
    .from('bases')
    .update({
      columns,
    })
    .eq('id', base);

  if (error) {
    return {
      error: error.message,
    };
  }

  return {
    columns,
  };
}


// PARENT TREE VALIDATION


async function wouldCreateCycle(base, parent) {
  if (!parent) {
    return false;
  }

  if (parent === base) {
    return true;
  }

  const { data, error } = await liveBases();

  if (error) {
    throw new Error(error.message);
  }

  const byId = new Map(
    (data ?? []).map((item) => [item.id, item]),
  );

  let current = parent;
  const visited = new Set();

  while (current) {
    if (current === base) {
      return true;
    }

    if (visited.has(current)) {
      return true;
    }

    visited.add(current);

    current = byId.get(current)?.parent ?? null;

    // Built-in bases are valid roots.
    if (BUILTIN_IDS.has(current)) {
      return false;
    }
  }

  return false;
}


// ROW MAPPING

function mapRow(cols, row) {
  const data = {};

  for (const col of cols) {
    let value = row?.[col.key];

    if (value === undefined) {
      value = row?.[col.label];
    }

    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ''
    ) {
      continue;
    }

    if (col.type === 'number') {
      const parsed =
        typeof value === 'number'
          ? value
          : Number(
            String(value)
              .replace(',', '.')
              .trim(),
          );

      if (!Number.isFinite(parsed)) {
        throw new Error(
          `invalid number for column ${col.key}`,
        );
      }

      data[col.key] = parsed;
      continue;
    }

    if (
      col.type === 'select' ||
      col.type === 'text' ||
      col.type === 'long-text' ||
      col.type === 'url'
    ) {
      data[col.key] =
        typeof value === 'string'
          ? value.trim()
          : value;
    }
  }

  return data;
}

// MCP RESPONSE HELPERS


const ok = (obj) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify(obj, null, 2),
    },
  ],
});

const fail = (msg) => ({
  content: [
    {
      type: 'text',
      text: `Error: ${msg}`,
    },
  ],
  isError: true,
});




const server = new McpServer(
  {
    name: 'AiS',
    version: '0.3.0',
  },
  {
    instructions: INSTRUCTIONS,
  },
);
// MCP SKILLS

server.registerPrompt(
  'skill-catalog',
  {
    title: 'Catalog Skill',
    description:
      'Instructions for searching and verifying companies and products in the AiS catalog.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: loadSkill('catalog'),
        },
      },
    ],
  }),
);

server.registerPrompt(
  'skill-database',
  {
    title: 'Database Skill',
    description:
      'Instructions for safely managing AiS databases.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: loadSkill('database'),
        },
      },
    ],
  }),
);

server.registerPrompt(
  'skill-research',
  {
    title: 'Research Skill',
    description:
      'Instructions for researching companies, products, technologies and markets with AiS.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: loadSkill('research'),
        },
      },
    ],
  }),
);

// LIST BASES


server.registerTool(
  'list_bases',
  {
    title: 'List bases',
    description:
      'Lists all storefront bases, including built-in catalog slices and custom bases.',
  },
  async () => {
    const { data, error } = await liveBases();

    if (error) {
      return fail(error.message);
    }

    const custom = (data ?? []).map((base) => ({
      id: base.id,
      name: base.name,
      builtin: false,
      columns: (base.columns ?? []).map(
        (column) => column.key,
      ),
    }));

    const builtin = BUILTIN_BASES.map((base) => ({
      id: base.id,
      name: base.name,
      builtin: true,
    }));

    return ok({
      bases: [
        ...builtin,
        ...custom,
      ],
    });
  },
);

// GET BASE


server.registerTool(
  'get_base',
  {
    title: 'Base schema',
    description:
      'Returns the schema and row count of a live custom base.',
    inputSchema: {
      base: z
        .string()
        .describe('base id'),
    },
  },

  async ({ base }) => {
    if (BUILTIN_IDS.has(base)) {
      return fail(
        'built-in bases are catalog slices with fixed columns',
      );
    }

    const { data, error } = await liveBases();

    if (error) {
      return fail(error.message);
    }

    const found = (data ?? []).find(
      (item) => item.id === base,
    );

    if (!found) {
      return fail('base not found');
    }

    const {
      data: records,
      error: recordsError,
    } = await liveRecords(base);

    if (recordsError) {
      return fail(recordsError.message);
    }

    return ok({
      id: found.id,
      name: found.name,
      parent: found.parent ?? null,
      columns: found.columns ?? [],
      rowCount: (records ?? []).length,
    });
  },
);


// ADD COLUMN


server.registerTool(
  'add_column',
  {
    title: 'Add column',

    description:
      'Adds a column to a live custom base.',

    inputSchema: {
      base: z.string(),
      label: z.string(),
      type: z
        .enum([
          'text',
          'number',
          'select',
          'url',
          'long-text',
        ])
        .optional(),
      filterable: z.boolean().optional(),
    },
  },

  async ({
    base,
    label,
    type,
    filterable,
  }) => {
    const result =
      await assertLiveCustomBase(base);

    if (result.error) {
      return fail(result.error);
    }

    if (!label.trim()) {
      return fail('column label is required');
    }

    const next = [
      ...result.columns,
      normalizeNewColumnMjs(
        {
          label,
          type,
          filterable,
        },
        result.columns,
      ),
    ];

    const saved = await saveColumns(
      base,
      next,
    );

    if (saved.error) {
      return fail(saved.error);
    }

    return ok({
      base,
      columns: saved.columns,
    });
  },
);

// UPDATE COLUMN


server.registerTool(
  'update_column',
  {
    title: 'Update column',

    description:
      "Changes a column's label, type or filterable state. The key remains unchanged.",

    inputSchema: {
      base: z.string(),
      key: z.string(),
      label: z.string().optional(),
      type: z
        .enum([
          'text',
          'number',
          'select',
          'url',
          'long-text',
        ])
        .optional(),
      filterable: z.boolean().optional(),
    },
  },

  async ({
    base,
    key,
    label,
    type,
    filterable,
  }) => {
    const result =
      await assertLiveCustomBase(base);

    if (result.error) {
      return fail(result.error);
    }

    if (
      !result.columns.some(
        (column) => column.key === key,
      )
    ) {
      return fail(`no column ${key}`);
    }

    const next = result.columns.map(
      (column) =>
        column.key === key
          ? applyColumnPatchMjs(
            column,
            {
              label,
              type,
              filterable,
            },
          )
          : column,
    );

    const saved = await saveColumns(
      base,
      next,
    );

    if (saved.error) {
      return fail(saved.error);
    }

    return ok({
      base,
      columns: saved.columns,
    });
  },
);


// DELETE COLUMN


server.registerTool(
  'delete_column',
  {
    title: 'Delete column',

    description:
      'Removes a column from a live custom base. Existing cell data remains stored.',

    inputSchema: {
      base: z.string(),
      key: z.string(),
    },
  },

  async ({ base, key }) => {
    const result =
      await assertLiveCustomBase(base);

    if (result.error) {
      return fail(result.error);
    }

    if (
      !result.columns.some(
        (column) => column.key === key,
      )
    ) {
      return fail(`no column ${key}`);
    }

    const next = result.columns.filter(
      (column) => column.key !== key,
    );

    const saved = await saveColumns(
      base,
      next,
    );

    if (saved.error) {
      return fail(saved.error);
    }

    return ok({
      base,
      columns: saved.columns,
    });
  },
);


// RENAME BASE


server.registerTool(
  'rename_base',
  {
    title: 'Rename base',

    description:
      "Renames a live custom base without changing its id.",

    inputSchema: {
      base: z.string(),
      name: z.string(),
    },
  },

  async ({ base, name }) => {
    if (BUILTIN_IDS.has(base)) {
      return fail(
        'built-in bases cannot be renamed',
      );
    }

    if (!name?.trim()) {
      return fail('name is required');
    }

    let result = await supa
      .from('bases')
      .update({
        name: name.trim(),
      })
      .eq('id', base)
      .is('deleted_at', null)
      .select('id, name')
      .maybeSingle();

    if (
      result.error &&
      /deleted_at/.test(
        result.error.message,
      )
    ) {
      result = await supa
        .from('bases')
        .update({
          name: name.trim(),
        })
        .eq('id', base)
        .select('id, name')
        .maybeSingle();
    }

    if (result.error) {
      return fail(result.error.message);
    }

    if (!result.data) {
      return fail('base not found');
    }

    return ok({
      id: result.data.id,
      name: result.data.name,
    });
  },
);


// MOVE BASE


server.registerTool(
  'move_base',
  {
    title: 'Move base',

    description:
      "Changes a custom base's parent in the tree.",

    inputSchema: {
      base: z.string(),
      parent: z
        .string()
        .nullable()
        .optional(),
    },
  },

  async ({ base, parent }) => {
    if (BUILTIN_IDS.has(base)) {
      return fail(
        'built-in bases cannot be moved',
      );
    }

    const live =
      await assertLiveCustomBase(base);

    if (live.error) {
      return fail(live.error);
    }

    const targetParent =
      parent ?? null;

    if (targetParent) {
      const {
        data,
        error,
      } = await liveBases();

      if (error) {
        return fail(error.message);
      }

      const known = new Set([
        ...(data ?? []).map(
          (item) => item.id,
        ),
        ...BUILTIN_IDS,
      ]);

      if (!known.has(targetParent)) {
        return fail(
          `no live base with id ${targetParent}`,
        );
      }

      if (targetParent === base) {
        return fail(
          'a base cannot be its own parent',
        );
      }

      try {
        if (
          await wouldCreateCycle(
            base,
            targetParent,
          )
        ) {
          return fail(
            'moving the base would create a parent cycle',
          );
        }
      } catch (error) {
        return fail(
          error?.message ??
          'failed to validate parent tree',
        );
      }
    }

    let result = await supa
      .from('bases')
      .update({
        parent: targetParent,
      })
      .eq('id', base)
      .is('deleted_at', null)
      .select('id, parent')
      .maybeSingle();

    if (
      result.error &&
      /deleted_at/.test(
        result.error.message,
      )
    ) {
      result = await supa
        .from('bases')
        .update({
          parent: targetParent,
        })
        .eq('id', base)
        .select('id, parent')
        .maybeSingle();
    }

    if (result.error) {
      return fail(result.error.message);
    }

    if (!result.data) {
      return fail('base not found');
    }

    return ok({
      id: result.data.id,
      parent:
        result.data.parent ?? null,
    });
  },
);


// DELETE BASE


server.registerTool(
  'delete_base',
  {
    title: 'Delete base (to trash)',

    description:
      'Moves a live custom base to the trash.',

    inputSchema: {
      base: z.string(),
    },
  },

  async ({ base }) => {
    if (BUILTIN_IDS.has(base)) {
      return fail(
        'built-in bases cannot be deleted',
      );
    }

    const live =
      await assertLiveCustomBase(base);

    if (live.error) {
      return fail(live.error);
    }

    const {
      data,
      error,
    } = await supa
      .from('bases')
      .update({
        deleted_at:
          new Date().toISOString(),
      })
      .eq('id', base)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      return fail(error.message);
    }

    if (!data) {
      return fail('base not found');
    }

    return ok({
      deleted: base,
      bin: true,
    });
  },
);


// DELETE ROWS


server.registerTool(
  'delete_rows',
  {
    title: 'Delete rows (to trash)',

    description:
      'Moves live rows to the trash.',

    inputSchema: {
      base: z.string(),
      ids: z
        .array(z.string())
        .min(1),
    },
  },

  async ({ base, ids }) => {
    const live =
      await assertLiveCustomBase(base);

    if (live.error) {
      return fail(live.error);
    }

    const {
      data,
      error,
    } = await supa
      .from('base_records')
      .update({
        deleted_at:
          new Date().toISOString(),
      })
      .eq('base_id', base)
      .is('deleted_at', null)
      .in('id', ids)
      .select('id');

    if (error) {
      return fail(error.message);
    }

    return ok({
      deleted: (data ?? []).map(
        (row) => row.id,
      ),
      bin: true,
    });
  },
);


// LIST BIN


server.registerTool(
  'list_bin',
  {
    title: 'Trash',

    description:
      'Lists deleted bases and rows.',

    inputSchema: {},
  },

  async () => {
    const {
      data: bases,
      error: baseError,
    } = await supa
      .from('bases')
      .select('id, name')
      .not('deleted_at', 'is', null);

    if (baseError) {
      return fail(baseError.message);
    }

    const {
      data: records,
      error: recordError,
    } = await supa
      .from('base_records')
      .select(
        'id, base_id, data',
      )
      .not('deleted_at', 'is', null);

    if (recordError) {
      return fail(recordError.message);
    }

    return ok({
      bases: (bases ?? []).map(
        (base) => ({
          id: base.id,
          name: base.name,
        }),
      ),

      records: (records ?? []).map(
        (record) => ({
          id: record.id,
          base: record.base_id,
          name:
            record.data?.name ??
            record.data?.['название'] ??
            null,
        }),
      ),
    });
  },
);


// RESTORE


server.registerTool(
  'restore',
  {
    title: 'Restore from trash',

    description:
      'Restores a deleted base or deleted rows.',

    inputSchema: {
      base: z
        .string()
        .optional()
        .describe(
          'id of deleted base',
        ),

      rows: z
        .object({
          base: z.string(),
          ids: z
            .array(z.string())
            .min(1),
        })
        .optional()
        .describe(
          'rows to restore',
        ),
    },
  },

  async ({ base, rows }) => {
    if (!base && !rows) {
      return fail(
        'specify base or rows',
      );
    }

    const restored = {};

    if (base) {
      if (BUILTIN_IDS.has(base)) {
        return fail(
          'built-in bases cannot be restored',
        );
      }

      const {
        data,
        error,
      } = await supa
        .from('bases')
        .update({
          deleted_at: null,
        })
        .eq('id', base)
        .not('deleted_at', 'is', null)
        .select('id')
        .maybeSingle();

      if (error) {
        return fail(error.message);
      }

      if (!data) {
        return fail(
          'base not found in trash',
        );
      }

      restored.base = base;
    }

    if (rows) {
      const {
        data,
        error,
      } = await supa
        .from('base_records')
        .update({
          deleted_at: null,
        })
        .eq('base_id', rows.base)
        .in('id', rows.ids)
        .not('deleted_at', 'is', null)
        .select('id');

      if (error) {
        return fail(error.message);
      }

      restored.rows = (
        data ?? []
      ).map((row) => row.id);
    }

    return ok({
      restored,
    });
  },
);


// EMPTY BIN


server.registerTool(
  'empty_bin',
  {
    title:
      'Empty trash (irreversible)',

    description:
      'Permanently deletes trash. Without confirm:true it only returns a preview.',

    inputSchema: {
      confirm: z
        .boolean()
        .optional(),

      base: z
        .string()
        .optional()
        .describe(
          'empty only this base',
        ),
    },
  },

  async ({ confirm, base }) => {
    let baseQuery = supa
      .from('bases')
      .select('id, name')
      .not('deleted_at', 'is', null);

    if (base) {
      baseQuery =
        baseQuery.eq('id', base);
    }

    const {
      data: deletedBases,
      error: baseError,
    } = await baseQuery;

    if (baseError) {
      return fail(baseError.message);
    }

    const deletedBaseIds = (
      deletedBases ?? []
    ).map((item) => item.id);

    let rowsOwnedByDeletedBases = 0;

    if (deletedBaseIds.length) {
      const {
        count,
        error,
      } = await supa
        .from('base_records')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .in(
          'base_id',
          deletedBaseIds,
        );

      if (error) {
        return fail(error.message);
      }

      rowsOwnedByDeletedBases =
        count ?? 0;
    }

    let looseRowsQuery = supa
      .from('base_records')
      .select('id, base_id')
      .not('deleted_at', 'is', null);

    if (base) {
      looseRowsQuery =
        looseRowsQuery.eq(
          'base_id',
          base,
        );
    }

    const {
      data: looseRows,
      error: looseError,
    } =
      await looseRowsQuery;

    if (looseError) {
      return fail(
        looseError.message,
      );
    }

    const deletedBaseIdSet =
      new Set(
        deletedBaseIds,
      );

    const looseCount = (
      looseRows ?? []
    ).filter(
      (row) =>
        !deletedBaseIdSet.has(
          row.base_id,
        ),
    ).length;

    const recordCount =
      rowsOwnedByDeletedBases +
      looseCount;

    if (!confirm) {
      return ok({
        dryRun: true,

        wouldDelete: {
          bases: (
            deletedBases ?? []
          ).map(
            (item) => item.name,
          ),

          baseCount:
            deletedBases?.length ??
            0,

          records:
            recordCount,
        },

        hint:
          'repeat with confirm:true to delete permanently',
      });
    }

    let recordDeleteQuery =
      supa
        .from('base_records')
        .delete()
        .not(
          'deleted_at',
          'is',
          null,
        );

    if (base) {
      recordDeleteQuery =
        recordDeleteQuery.eq(
          'base_id',
          base,
        );
    }

    const {
      error: recordDeleteError,
    } =
      await recordDeleteQuery;

    if (recordDeleteError) {
      return fail(
        recordDeleteError.message,
      );
    }

    let baseCount = 0;

    for (
      const deletedBase
      of deletedBases ?? []
    ) {
      const {
        error: rowDeleteError,
      } = await supa
        .from('base_records')
        .delete()
        .eq(
          'base_id',
          deletedBase.id,
        );

      if (rowDeleteError) {
        return fail(
          rowDeleteError.message,
        );
      }

      const {
        error: baseDeleteError,
      } = await supa
        .from('bases')
        .delete()
        .eq(
          'id',
          deletedBase.id,
        );

      if (baseDeleteError) {
        return fail(
          baseDeleteError.message,
        );
      }

      baseCount++;
    }

    return ok({
      emptied: true,
      bases: baseCount,
      records: recordCount,
    });
  },
);

// CREATE BASE


server.registerTool(
  'create_base',
  {
    title: 'Create base',

    description:
      'Creates a custom base with columns and optional initial rows.',

    inputSchema: {
      name: z
        .string()
        .describe('base name'),

      columns: z
        .array(
          z.object({
            label: z.string(),

            type: z
              .enum([
                'text',
                'number',
                'select',
                'url',
                'long-text',
              ])
              .optional(),

            filterable:
              z.boolean().optional(),
          }),
        )
        .describe('base columns'),

      rows: z
        .array(
          z.record(
            z.string(),
            z.any(),
          ),
        )
        .optional()
        .describe(
          'initial rows',
        ),

      parent: z
        .string()
        .optional()
        .describe(
          'live parent base id',
        ),
    },
  },

  async ({
    name,
    columns,
    rows,
    parent,
  }) => {
    if (!name?.trim()) {
      return fail('name is required');
    }

    const cols =
      normalizeColumns(columns);

    if (!cols.length) {
      return fail(
        'at least one column is required',
      );
    }

    const {
      data: existing,
      error: existingError,
    } = await liveBases();

    if (existingError) {
      return fail(
        existingError.message,
      );
    }

    const known = new Set([
      ...(existing ?? []).map(
        (item) => item.id,
      ),
      ...BUILTIN_IDS,
    ]);

    if (
      parent &&
      !known.has(parent)
    ) {
      return fail(
        `no live base with id ${parent}`,
      );
    }

    const id = slugId(
      name,
      known,
    );

    const baseRow = {
      id,
      name: name.trim(),
      tone: 'sage',
      columns: cols,
    };

    if (parent) {
      baseRow.parent = parent;
    }

    const {
      error: createError,
    } = await supa
      .from('bases')
      .insert(baseRow);

    if (createError) {
      return fail(
        createError.message,
      );
    }

    let imported = 0;

    if (rows?.length) {
      let payload;

      try {
        payload = rows
          .map((row) => ({
            base_id: id,
            data: mapRow(
              cols,
              row,
            ),
          }))
          .filter(
            (item) =>
              Object.keys(
                item.data,
              ).length > 0,
          );
      } catch (error) {
        await supa
          .from('bases')
          .delete()
          .eq('id', id);

        return fail(
          `base creation rolled back: ${error.message}`,
        );
      }

      if (payload.length) {
        const {
          error: rowsError,
        } = await supa
          .from('base_records')
          .insert(payload);

        if (rowsError) {
          return fail(
            `base created (${id}), but rows failed to insert: ${rowsError.message}`,
          );
        }

        imported =
          payload.length;
      }
    }

    return ok({
      id,
      name: name.trim(),
      parent: parent ?? null,
      columns:
        cols.map(
          (column) =>
            column.key,
        ),
      imported,
    });
  },
);


// ADD ROWS


server.registerTool(
  'add_rows',
  {
    title: 'Add rows',

    description:
      'Adds rows to a live custom base.',

    inputSchema: {
      base: z
        .string()
        .describe('base id'),

      rows: z
        .array(
          z.record(
            z.string(),
            z.any(),
          ),
        )
        .describe(
          'row objects keyed by label or column key',
        ),
    },
  },

  async ({ base, rows }) => {
    const live =
      await assertLiveCustomBase(
        base,
      );

    if (live.error) {
      return fail(live.error);
    }

    const cols =
      live.columns ?? [];

    let payload;

    try {
      payload = rows
        .map((row) => ({
          base_id: base,
          data: mapRow(
            cols,
            row,
          ),
        }))
        .filter(
          (item) =>
            Object.keys(
              item.data,
            ).length > 0,
        );
    } catch (error) {
      return fail(
        error.message,
      );
    }

    if (!payload.length) {
      return ok({
        added: 0,
      });
    }

    const {
      error,
    } = await supa
      .from('base_records')
      .insert(payload);

    if (error) {
      return fail(error.message);
    }

    return ok({
      added: payload.length,
    });
  },
);


// QUERY RECORDS

server.registerTool(
  'query_records',
  {
    title: 'Read records',

    description:
      'Returns records from a built-in or custom base with optional text search and pagination.',

    inputSchema: {
      base: z
        .string()
        .describe(
          'base id',
        ),

      search: z
        .string()
        .optional()
        .describe(
          'substring to search for',
        ),

      limit: z
        .number()
        .int()
        .positive()
        .max(500)
        .optional(),

      offset: z
        .number()
        .int()
        .nonnegative()
        .optional(),
    },
  },

  async ({
    base,
    search,
    limit,
    offset,
  }) => {
    const lim =
      limit ?? 50;

    const off =
      offset ?? 0;

    const q =
      (search ?? '')
        .trim()
        .toLowerCase();

    // Built-in catalog bases.
    if (BUILTIN_IDS.has(base)) {
      const definition =
        BUILTIN_BASES.find(
          (item) =>
            item.id === base,
        );

      const {
        data,
        error,
      } = await supa
        .from('products')
        .select('data')
        .order('id');

      if (error) {
        return fail(error.message);
      }

      let records = (
        data ?? []
      ).map((row) => ({
        ...row.data,
        section:
          row.data.section ??
          sectionFor(
            row.data.vertical,
          ),
      }));

      if (definition.section) {
        records =
          records.filter(
            (record) =>
              record.section ===
              definition.section,
          );
      }

      if (q) {
        records =
          records.filter(
            (record) =>
              Object.values(record)
                .filter(
                  (value) =>
                    typeof value ===
                    'string',
                )
                .join(' ')
                .toLowerCase()
                .includes(q),
          );
      }

      const page =
        records.slice(
          off,
          off + lim,
        );

      return ok({
        base,
        total: records.length,
        offset: off,
        hasMore:
          off + page.length <
          records.length,

        records:
          page.map((record) => ({
            id: record.id,
            name: record.name,
            verdict:
              record.verdict,
            vertical:
              record.vertical,
            section:
              record.section,
            url: record.url,
          })),
      });
    }

    // Custom base must be live.
    const live =
      await assertLiveCustomBase(
        base,
      );

    if (live.error) {
      return fail(live.error);
    }

    const {
      data,
      error,
    } = await liveRecords(
      base,
    );

    if (error) {
      return fail(error.message);
    }

    let records = (
      data ?? []
    ).map((row) => ({
      id: row.id,
      ...row.data,
    }));

    if (q) {
      records =
        records.filter(
          (record) =>
            Object.values(record)
              .filter(
                (value) =>
                  typeof value ===
                  'string',
              )
              .join(' ')
              .toLowerCase()
              .includes(q),
        );
    }

    const page =
      records.slice(
        off,
        off + lim,
      );

    return ok({
      base,
      total: records.length,
      offset: off,
      hasMore:
        off + page.length <
        records.length,
      records: page,
    });
  },
);


// UPDATE RECORD


server.registerTool(
  'update_record',
  {
    title: 'Update record',

    description:
      'Updates fields of a single live row in a custom base.',

    inputSchema: {
      base: z.string(),

      id: z
        .string()
        .describe('row id'),

      data: z
        .record(
          z.string(),
          z.any(),
        )
        .describe(
          'fields keyed by column key',
        ),
    },
  },

  async ({
    base,
    id,
    data,
  }) => {
    const live =
      await assertLiveCustomBase(
        base,
      );

    if (live.error) {
      return fail(live.error);
    }

    const {
      data: current,
      error,
    } = await supa
      .from('base_records')
      .select('data')
      .eq('id', id)
      .eq('base_id', base)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      return fail(error.message);
    }

    if (!current) {
      return fail(
        'live row not found',
      );
    }

    let mapped;

    try {
      mapped = mapRow(
        live.columns ?? [],
        data,
      );
    } catch (error) {
      return fail(
        error.message,
      );
    }

    const merged = {
      ...(current.data ?? {}),
      ...mapped,
    };

    const {
      error: updateError,
    } = await supa
      .from('base_records')
      .update({
        data: merged,
      })
      .eq('id', id)
      .eq('base_id', base)
      .is('deleted_at', null);

    if (updateError) {
      return fail(
        updateError.message,
      );
    }

    return ok({
      id,
      data: merged,
    });
  },
);


// CATALOG SEARCH


server.registerTool(
  'catalog_search',
  {
    title: 'Search catalog',

    description:
      'Searches companies in the product catalog by text and section.',

    inputSchema: {
      query: z
        .string()
        .optional()
        .describe(
          'text query',
        ),

      section: z
        .enum([
          'AI',
          'IT',
          'WorkOS',
        ])
        .optional(),

      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional(),

      offset: z
        .number()
        .int()
        .nonnegative()
        .optional(),
    },
  },

  async ({
    query,
    section,
    limit,
    offset,
  }) => {
    const {
      data,
      error,
    } = await supa
      .from('products')
      .select('data')
      .order('id');

    if (error) {
      return fail(error.message);
    }

    let records = (
      data ?? []
    ).map((row) => ({
      ...row.data,
      section:
        row.data.section ??
        sectionFor(
          row.data.vertical,
        ),
    }));

    if (section) {
      records =
        records.filter(
          (record) =>
            record.section ===
            section,
        );
    }

    const q =
      (query ?? '')
        .trim()
        .toLowerCase();

    if (q) {
      records =
        records.filter(
          (record) =>
            Object.values(record)
              .filter(
                (value) =>
                  typeof value ===
                  'string',
              )
              .join(' ')
              .toLowerCase()
              .includes(q),
        );
    }

    const off =
      offset ?? 0;

    const page =
      records.slice(
        off,
        off + (limit ?? 20),
      );

    return ok({
      total: records.length,
      offset: off,
      hasMore:
        off + page.length <
        records.length,

      results:
        page.map((record) => ({
          id: record.id,
          name: record.name,
          verdict:
            record.verdict,
          section:
            record.section,
          vertical:
            record.vertical,
          url: record.url,
        })),
    });
  },
);

// OPENROUTER


const FREE_MODELS_TTL_MS =
  60 * 60 * 1000;

let freeModelsCache = null;

function isZeroPrice(value) {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    Number(value) === 0
  );
}

function pickFreeIds(models) {
  return (
    Array.isArray(models)
      ? models
      : []
  )
    .filter(
      (model) =>
        model?.id &&
        model.pricing &&
        isZeroPrice(
          model.pricing.prompt,
        ) &&
        isZeroPrice(
          model.pricing.completion,
        ),
    )
    .map(
      (model) =>
        String(model.id),
    );
}

async function freeModelIds() {
  if (
    freeModelsCache &&
    Date.now() -
    freeModelsCache.at <
    FREE_MODELS_TTL_MS
  ) {
    return freeModelsCache.ids;
  }

  try {
    const controller =
      new AbortController();

    const timer = setTimeout(
      () =>
        controller.abort(),
      10000,
    );

    try {
      const response =
        await fetch(
          'https://openrouter.ai/api/v1/models',
          {
            headers:
              process.env
                .OPENROUTER_API_KEY
                ? {
                  Authorization:
                    `Bearer ${process.env.OPENROUTER_API_KEY}`,
                }
                : {},

            signal:
              controller.signal,
          },
        );

      if (!response.ok) {
        throw new Error(
          `OpenRouter models ${response.status}`,
        );
      }

      const data =
        await response.json();

      const ids =
        pickFreeIds(
          data?.data,
        );

      freeModelsCache = {
        ids,
        at: Date.now(),
      };

      return ids;
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.error(
      'free model list fetch failed:',
      error,
    );

    return (
      freeModelsCache?.ids ??
      []
    );
  }
}

async function modelCandidates(
  limit = 6,
) {
  const override =
    process.env
      .OPENROUTER_MODEL?.trim();

  if (override) {
    return [override];
  }

  const ids = [
    ...(await freeModelIds()),
  ];

  // Fisher-Yates shuffle.
  for (
    let i = ids.length - 1;
    i > 0;
    i--
  ) {
    const j = Math.floor(
      Math.random() *
      (i + 1),
    );

    [
      ids[i],
      ids[j],
    ] = [
        ids[j],
        ids[i],
      ];
  }

  return ids.slice(
    0,
    limit,
  );
}

async function openrouterChatCandidates(
  body,
  candidates,
) {
  const timeoutMs =
    Math.max(
      1000,
      Number(
        process.env
          .OPENROUTER_TIMEOUT_MS,
      ) || 20000,
    );

  for (const model of candidates) {
    const controller =
      new AbortController();

    const timer = setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

    try {
      const response =
        await fetch(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            method: 'POST',

            headers: {
              Authorization:
                `Bearer ${process.env.OPENROUTER_API_KEY}`,

              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              ...body,
              model,
            }),

            signal:
              controller.signal,
          },
        );

      if (response.ok) {
        return await response.json();
      }

      const detail =
        await response
          .text()
          .catch(() => '');

      console.error(
        `model ${model} failed (${response.status}): ${detail.slice(0, 300)}`,
      );
    } catch (error) {
      console.error(
        `model ${model} failed, trying next:`,
        error?.name ===
          'AbortError'
          ? `timeout after ${timeoutMs}ms`
          : error,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}


// RESEARCH DECOMPOSITION


const SYS =
  'You are a senior AI product market analyst. ' +
  'Break the query down into 8–10 specific, mutually ' +
  'non-overlapping, verifiable subtopics in English. ' +
  'Each one a short phrase (up to ~8 words). ' +
  'Return ONLY a JSON array of strings.';

function heuristic(prompt) {
  const text =
    prompt
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80) ||
    'topic';

  return [
    `Overview: ${text}`,
    `Key players: ${text}`,
    `Technology: ${text}`,
    `Market and trends: ${text}`,
    `Monetization: ${text}`,
    `Risks: ${text}`,
    `Case studies: ${text}`,
    `Sources: ${text}`,
  ];
}

function parseList(text) {
  const start =
    text.indexOf('[');

  const end =
    text.lastIndexOf(']');

  if (
    start === -1 ||
    end === -1
  ) {
    return [];
  }

  try {
    const value =
      JSON.parse(
        text.slice(
          start,
          end + 1,
        ),
      );

    if (
      !Array.isArray(
        value,
      )
    ) {
      return [];
    }

    return value
      .filter(
        (item) =>
          typeof item ===
          'string',
      )
      .map(
        (item) =>
          item.trim(),
      )
      .filter(Boolean)
      .slice(0, 12);
  } catch {
    return [];
  }
}

server.registerTool(
  'research_decompose',
  {
    title:
      'Decompose query',

    description:
      'Breaks a research query into subtopics using OpenRouter when available and a deterministic heuristic otherwise.',

    inputSchema: {
      prompt: z
        .string()
        .describe(
          'what to research',
        ),
    },
  },

  async ({ prompt }) => {
    if (!prompt?.trim()) {
      return fail(
        'empty query',
      );
    }

    const user =
      `Query: "${prompt}"\n\n` +
      'Return ONLY a JSON array of strings.';

    try {
      if (
        process.env
          .OPENROUTER_API_KEY
      ) {
        const candidates =
          await modelCandidates();

        if (
          candidates.length
        ) {
          const result =
            await openrouterChatCandidates(
              {
                max_tokens: 1024,

                messages: [
                  {
                    role: 'system',
                    content: SYS,
                  },
                  {
                    role: 'user',
                    content: user,
                  },
                ],
              },
              candidates,
            );

          const subtopics =
            parseList(
              result
                ?.choices?.[0]
                ?.message
                ?.content ??
              '',
            );

          if (
            subtopics.length >= 3
          ) {
            return ok({
              source:
                'openrouter',

              subtopics,
            });
          }
        }
      }
    } catch (error) {
      console.error(
        'decompose provider failed:',
        error,
      );
    }

    return ok({
      source:
        'heuristic',

      subtopics:
        heuristic(prompt),
    });
  },
);


// CREATE BASE PROMPT


server.registerPrompt(
  'create-base',
  {
    title:
      'Set up a base for a topic',

    description:
      'How to create a knowledge base for a new topic and populate it from the catalog.',

    argsSchema: {
      topic: z
        .string()
        .optional()
        .describe(
          'topic of the future base',
        ),
    },
  },

  ({ topic }) => ({
    messages: [
      {
        role: 'user',

        content: {
          type: 'text',

          text: topic
            ? `${INSTRUCTIONS}\n\nTopic: ${topic}`
            : INSTRUCTIONS,
        },
      },
    ],
  }),
);


// RESEARCH TOPIC PROMPT

server.registerPrompt(
  'research-topic',
  {
    title:
      'Research a topic',

    description:
      'Research a topic using the client web search tools and save the results to a base.',

    argsSchema: {
      topic: z
        .string()
        .describe(
          'what to research',
        ),
    },
  },

  ({ topic }) => ({
    messages: [
      {
        role: 'user',

        content: {
          type: 'text',

          text:
            `${INSTRUCTIONS}\n\n` +
            `Research the topic: "${topic}".\n` +
            'Do the web search with your own tools, ' +
            'use the catalog to cross-check, ' +
            'and at the end offer to save ' +
            'what you found to a base.',
        },
      },
    ],
  }),
);


// PROCESS ERROR HANDLING


process.on(
  'unhandledRejection',
  (error) => {
    console.error(
      'ai-researcher-mcp unhandled rejection:',
      error,
    );
  },
);

process.on(
  'uncaughtException',
  (error) => {
    console.error(
      'ai-researcher-mcp uncaught exception:',
      error,
    );

    process.exit(1);
  },
);

// START MCP


const transport =
  new StdioServerTransport();

try {
  await server.connect(
    transport,
  );

  console.error(
    'ai-researcher-mcp ready',
  );
} catch (error) {
  console.error(
    'ai-researcher-mcp failed to start:',
    error,
  );

  process.exit(1);
}