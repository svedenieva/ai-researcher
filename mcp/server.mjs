#!/usr/bin/env node
// MCP-сервер для витрины AI-Researcher.
// Даёт агенту инструменты поверх той же базы Supabase, что и веб-приложение:
// список/создание баз, импорт строк, чтение/правка записей, поиск по каталогу
// продуктов и декомпозицию исследовательского запроса.
//
// Ходит в Supabase сервис-ключом напрямую (в обход веб-авторизации).
// Требуемые env: SUPABASE_URL, SUPABASE_SERVICE_KEY.
// Опционально: OPENROUTER_API_KEY (+ OPENROUTER_MODEL) или ANTHROPIC_API_KEY —
// для «умной» декомпозиции; без них используется эвристика.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Креды берём из окружения; если не заданы — подхватываем из ../.env.local
// витрины (тот же файл, что использует веб-приложение). Так секрет не нужно
// дублировать в конфиг MCP.
function loadEnvFallback() {
  try {
    const p = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i === -1) continue;
      const k = line.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = line.slice(i + 1).trim();
    }
  } catch {
    /* нет файла — полагаемся на process.env */
  }
}
loadEnvFallback();

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  console.error('ai-researcher-mcp: set SUPABASE_URL and SUPABASE_SERVICE_KEY');
  process.exit(1);
}
const supa = createClient(URL, KEY, { auth: { persistSession: false } });

// ── раздел выводится из вертикали (как в вебе) ──
const SECTION_BY_VERTICAL = {
  coding: 'IT',
  opensource: 'AI', video: 'AI', design: 'AI', 'agent-platform': 'AI', data: 'AI',
  'reddit-gem': 'AI', 'agent-observability': 'AI', 'agent-infra': 'AI', 'agent-orchestration': 'AI',
  support: 'WorkOS', marketing: 'WorkOS', sales: 'WorkOS', management: 'WorkOS', legaltech: 'WorkOS',
  hr: 'WorkOS', healthtech: 'WorkOS', fintech: 'WorkOS', logistics: 'WorkOS', agtech: 'WorkOS',
  proptech: 'WorkOS', insurance: 'WorkOS', edtech: 'WorkOS', ecommerce: 'WorkOS',
};
const sectionFor = (v) => (typeof v === 'string' ? SECTION_BY_VERTICAL[v] ?? null : null);

const BUILTIN_BASES = [
  { id: 'market', name: 'Рынок AI', section: null },
  { id: 'ai', name: 'AI-сфера', section: 'AI' },
  { id: 'it', name: 'IT-сфера', section: 'IT' },
  { id: 'workforce', name: 'Workforce', section: 'WorkOS' },
];
const BUILTIN_IDS = new Set(BUILTIN_BASES.map((b) => b.id));

// чтение, исключающее корзину; при отсутствии колонки deleted_at (до миграции)
// откатываемся к неотфильтрованному запросу — так же, как веб-стор
async function liveBases() {
  let { data, error } = await supa.from('bases').select('id, name, tone, columns, parent').is('deleted_at', null).order('created_at');
  if (error && /deleted_at/.test(error.message)) ({ data, error } = await supa.from('bases').select('id, name, tone, columns, parent').order('created_at'));
  return { data, error };
}
async function liveRecords(baseId) {
  let { data, error } = await supa.from('base_records').select('id, data').eq('base_id', baseId).is('deleted_at', null).order('created_at');
  if (error && /deleted_at/.test(error.message)) ({ data, error } = await supa.from('base_records').select('id, data').eq('base_id', baseId).order('created_at'));
  return { data, error };
}

function slugId(name, taken) {
  const base = name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/(^-|-$)/g, '').slice(0, 24) || 'base';
  let id = base, n = 1;
  while (taken.has(id)) id = `${base}-${++n}`;
  return id;
}
function normalizeColumns(input) {
  const cols = [], used = new Set();
  for (const raw of input ?? []) {
    const label = String(raw?.label ?? '').trim();
    if (!label) continue;
    let key = label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/(^_|_$)/g, '') || `col${cols.length}`;
    while (used.has(key)) key = `${key}_`;
    used.add(key);
    const t = ['number', 'url', 'long-text', 'select'].includes(raw?.type) ? raw.type : 'text';
    cols.push({ key, label, type: t, sortable: true, filterable: Boolean(raw?.filterable) && t !== 'long-text' && t !== 'url' });
  }
  return cols;
}
// mjs-аналоги хелперов колонок Phase 0 (§5.3) — отдельный рантайм, поэтому дублируются
function normalizeNewColumnMjs(col, existing) {
  const label = String(col?.label ?? '').trim();
  let key = label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/(^_|_$)/g, '') || `col${existing.length}`;
  const used = new Set(existing.map((c) => c.key));
  while (used.has(key)) key = `${key}_`;
  const type = ['number', 'url', 'long-text', 'select'].includes(col?.type) ? col.type : 'text';
  return { key, label, type, sortable: true, filterable: Boolean(col?.filterable) && type !== 'long-text' && type !== 'url' };
}
function applyColumnPatchMjs(col, patch) {
  const type = patch?.type ?? col.type;
  const label = patch?.label !== undefined ? (String(patch.label).trim() || col.label) : col.label;
  const filterable = (patch?.filterable ?? col.filterable ?? false) && type !== 'long-text' && type !== 'url';
  return { ...col, label, type, filterable };
}
async function loadCustomBase(base) {
  if (BUILTIN_IDS.has(base)) return { error: 'встроенные базы только для чтения' };
  const { data, error } = await liveBases();
  if (error) return { error: error.message };
  const b = (data ?? []).find((x) => x.id === base);
  if (!b) return { error: 'база не найдена' };
  return { base: b, columns: b.columns ?? [] };
}
async function saveColumns(base, columns) {
  const { error } = await supa.from('bases').update({ columns }).eq('id', base);
  return error ? { error: error.message } : { columns };
}
// строка (объект по label или key) → объект по key колонки, с приведением чисел
function mapRow(cols, row) {
  const data = {};
  for (const col of cols) {
    let v = row?.[col.key];
    if (v === undefined) v = row?.[col.label];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    data[col.key] = col.type === 'number' ? Number(String(v).replace(',', '.')) : v;
  }
  return data;
}
const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: `Ошибка: ${msg}` }], isError: true });

// Инструкция вшита в коннектор — отдельный скилл ставить не нужно: клиент
// получает её при подключении. Текст общий с HTTP-эндпоинтом витрины.
import { INSTRUCTIONS } from '../lib/mcp/instructions.mjs';

const server = new McpServer(
  { name: 'ai-researcher', version: '0.2.0' },
  { instructions: INSTRUCTIONS },
);

// ── list_bases ──
server.registerTool(
  'list_bases',
  { title: 'Список баз', description: 'Все базы витрины: 4 встроенных (срезы каталога) + пользовательские.' },
  async () => {
    const { data, error } = await liveBases();
    if (error) return fail(error.message);
    const custom = (data ?? []).map((b) => ({ id: b.id, name: b.name, builtin: false, columns: (b.columns ?? []).map((c) => c.key) }));
    const builtin = BUILTIN_BASES.map((b) => ({ id: b.id, name: b.name, builtin: true }));
    return ok({ bases: [...builtin, ...custom] });
  },
);

// ── get_base ──
server.registerTool(
  'get_base',
  {
    title: 'Схема базы',
    description: 'Полное описание пользовательской базы: колонки (key, label, type, filterable) и число строк.',
    inputSchema: { base: z.string().describe('id базы') },
  },
  async ({ base }) => {
    if (BUILTIN_IDS.has(base)) return fail('встроенные базы — срезы каталога, у них фиксированные колонки');
    const { data, error } = await liveBases();
    if (error) return fail(error.message);
    const b = (data ?? []).find((x) => x.id === base);
    if (!b) return fail('база не найдена');
    const { data: recs } = await liveRecords(base);
    return ok({ id: b.id, name: b.name, parent: b.parent ?? null, columns: b.columns ?? [], rowCount: (recs ?? []).length });
  },
);

// ── add_column / update_column / delete_column ──
server.registerTool('add_column', {
  title: 'Добавить колонку',
  description: 'Добавляет колонку в пользовательскую базу. key выводится из label автоматически.',
  inputSchema: { base: z.string(), label: z.string(), type: z.enum(['text', 'number', 'select', 'url', 'long-text']).optional(), filterable: z.boolean().optional() },
}, async ({ base, label, type, filterable }) => {
  const b = await loadCustomBase(base); if (b.error) return fail(b.error);
  const next = [...b.columns, normalizeNewColumnMjs({ label, type, filterable }, b.columns)];
  const r = await saveColumns(base, next); return r.error ? fail(r.error) : ok({ base, columns: r.columns });
});

server.registerTool('update_column', {
  title: 'Изменить колонку',
  description: 'Меняет label/type/filterable колонки. key колонки не меняется — данные строк не теряются.',
  inputSchema: { base: z.string(), key: z.string(), label: z.string().optional(), type: z.enum(['text', 'number', 'select', 'url', 'long-text']).optional(), filterable: z.boolean().optional() },
}, async ({ base, key, label, type, filterable }) => {
  const b = await loadCustomBase(base); if (b.error) return fail(b.error);
  if (!b.columns.some((c) => c.key === key)) return fail(`нет колонки ${key}`);
  const next = b.columns.map((c) => c.key === key ? applyColumnPatchMjs(c, { label, type, filterable }) : c);
  const r = await saveColumns(base, next); return r.error ? fail(r.error) : ok({ base, columns: r.columns });
});

server.registerTool('delete_column', {
  title: 'Удалить колонку',
  description: 'Убирает колонку из базы. Значения ячеек остаются в данных строк — вернув колонку с тем же key, данные снова видны.',
  inputSchema: { base: z.string(), key: z.string() },
}, async ({ base, key }) => {
  const b = await loadCustomBase(base); if (b.error) return fail(b.error);
  if (!b.columns.some((c) => c.key === key)) return fail(`нет колонки ${key}`);
  const r = await saveColumns(base, b.columns.filter((c) => c.key !== key)); return r.error ? fail(r.error) : ok({ base, columns: r.columns });
});

// ── rename_base / move_base / delete_base ──
server.registerTool('rename_base', {
  title: 'Переименовать базу', description: 'Меняет название пользовательской базы (id/слаг не меняется).',
  inputSchema: { base: z.string(), name: z.string() },
}, async ({ base, name }) => {
  if (BUILTIN_IDS.has(base)) return fail('встроенные базы переименовывать нельзя');
  if (!name?.trim()) return fail('нужно название');
  let { data, error } = await supa.from('bases').update({ name: name.trim() }).eq('id', base).is('deleted_at', null).select('id, name').maybeSingle();
  if (error && /deleted_at/.test(error.message)) ({ data, error } = await supa.from('bases').update({ name: name.trim() }).eq('id', base).select('id, name').maybeSingle());
  if (error) return fail(error.message); if (!data) return fail('база не найдена');
  return ok({ id: data.id, name: data.name });
});

server.registerTool('move_base', {
  title: 'Переместить базу', description: 'Меняет родителя базы в дереве (parent = id раздела или null для верхнего уровня).',
  inputSchema: { base: z.string(), parent: z.string().nullable().optional() },
}, async ({ base, parent }) => {
  if (BUILTIN_IDS.has(base)) return fail('встроенные базы перемещать нельзя');
  const p = parent ?? null;
  if (p) { const { data } = await liveBases(); const known = new Set([...(data ?? []).map((b) => b.id), ...BUILTIN_IDS]); if (!known.has(p)) return fail(`нет базы с id ${p}`); if (p === base) return fail('база не может быть своим родителем'); }
  let { data, error } = await supa.from('bases').update({ parent: p }).eq('id', base).is('deleted_at', null).select('id, parent').maybeSingle();
  if (error && /deleted_at/.test(error.message)) ({ data, error } = await supa.from('bases').update({ parent: p }).eq('id', base).select('id, parent').maybeSingle());
  if (error) return fail(error.message); if (!data) return fail('база не найдена');
  return ok({ id: data.id, parent: data.parent ?? null });
});

server.registerTool('delete_base', {
  title: 'Удалить базу (в корзину)', description: 'Переносит базу и её строки в корзину. Восстановимо через restore; окончательно — только empty_bin.',
  inputSchema: { base: z.string() },
}, async ({ base }) => {
  if (BUILTIN_IDS.has(base)) return fail('встроенные базы удалять нельзя');
  const { data, error } = await supa.from('bases').update({ deleted_at: new Date().toISOString() }).eq('id', base).select('id').maybeSingle();
  if (error) return fail(error.message); if (!data) return fail('база не найдена');
  return ok({ deleted: base, bin: true });
});

// ── delete_rows ──
server.registerTool('delete_rows', {
  title: 'Удалить строки (в корзину)', description: 'Переносит строки в корзину по списку id. Восстановимо через restore.',
  inputSchema: { base: z.string(), ids: z.array(z.string()).min(1) },
}, async ({ base, ids }) => {
  if (BUILTIN_IDS.has(base)) return fail('во встроенных базах строки не удаляются');
  const { data, error } = await supa.from('base_records').update({ deleted_at: new Date().toISOString() }).eq('base_id', base).in('id', ids).select('id');
  if (error) return fail(error.message);
  return ok({ deleted: (data ?? []).map((r) => r.id), bin: true });
});

// ── list_bin / restore ──
server.registerTool('list_bin', {
  title: 'Корзина', description: 'Показывает удалённые базы и строки (deleted_at не пуст).',
  inputSchema: {},
}, async () => {
  const { data: bd, error: be } = await supa.from('bases').select('id, name').not('deleted_at', 'is', null);
  if (be) return fail(be.message);
  const { data: rd, error: re } = await supa.from('base_records').select('id, base_id, data').not('deleted_at', 'is', null);
  if (re) return fail(re.message);
  return ok({
    bases: (bd ?? []).map((b) => ({ id: b.id, name: b.name })),
    records: (rd ?? []).map((r) => ({ id: r.id, base: r.base_id, name: r.data?.name ?? r.data?.['название'] ?? null })),
  });
});

server.registerTool('restore', {
  title: 'Восстановить из корзины', description: 'Возвращает базу или строки из корзины (deleted_at → null).',
  inputSchema: { base: z.string().optional().describe('id базы для восстановления'), rows: z.object({ base: z.string(), ids: z.array(z.string()).min(1) }).optional().describe('строки для восстановления') },
}, async ({ base, rows }) => {
  if (!base && !rows) return fail('укажи base или rows');
  const out = {};
  if (base) { const { data, error } = await supa.from('bases').update({ deleted_at: null }).eq('id', base).select('id').maybeSingle(); if (error) return fail(error.message); if (!data) return fail('база не найдена'); out.base = base; }
  if (rows) { const { data, error } = await supa.from('base_records').update({ deleted_at: null }).eq('base_id', rows.base).in('id', rows.ids).select('id'); if (error) return fail(error.message); out.rows = (data ?? []).map((r) => r.id); }
  return ok({ restored: out });
});

// ── empty_bin (confirm-gated, dry-run by default) ──
server.registerTool('empty_bin', {
  title: 'Очистить корзину (безвозвратно)',
  description: 'Окончательно удаляет содержимое корзины. Без confirm:true возвращает предпросмотр и ничего не удаляет.',
  inputSchema: { confirm: z.boolean().optional(), base: z.string().optional().describe('очистить только эту базу; иначе — всё') },
}, async ({ confirm, base }) => {
  // предпросмотр — честный: реальное удаление ниже стирает ВСЕ строки binned-баз
  // (не только помеченные deleted_at), плюс отдельно помеченные строки в живых базах
  let baseQ = supa.from('bases').select('id, name').not('deleted_at', 'is', null); if (base) baseQ = baseQ.eq('id', base);
  const { data: binBases, error: be } = await baseQ; if (be) return fail(be.message);
  const binIds = (binBases ?? []).map((b) => b.id);
  let ownRowCount = 0;
  if (binIds.length) {
    const { count, error: oe } = await supa.from('base_records').select('id', { count: 'exact', head: true }).in('base_id', binIds);
    if (oe) return fail(oe.message);
    ownRowCount = count ?? 0;
  }
  let looseQ = supa.from('base_records').select('id, base_id').not('deleted_at', 'is', null); if (base) looseQ = looseQ.eq('base_id', base);
  const { data: looseRows, error: re } = await looseQ; if (re) return fail(re.message);
  const binIdSet = new Set(binIds);
  const looseCount = (looseRows ?? []).filter((r) => !binIdSet.has(r.base_id)).length;
  const recCount = ownRowCount + looseCount;
  if (!confirm) return ok({ dryRun: true, wouldDelete: { bases: (binBases ?? []).map((b) => b.name), baseCount: (binBases ?? []).length, records: recCount }, hint: 'повтори с confirm:true чтобы удалить безвозвратно' });
  // реальное удаление
  let recDel = supa.from('base_records').delete().not('deleted_at', 'is', null); if (base) recDel = recDel.eq('base_id', base);
  const { error: rde } = await recDel; if (rde) return fail(rde.message);
  let bases = 0;
  for (const b of binBases ?? []) { await supa.from('base_records').delete().eq('base_id', b.id); const { error: de } = await supa.from('bases').delete().eq('id', b.id); if (de) return fail(de.message); bases++; }
  return ok({ emptied: true, bases, records: recCount });
});

// ── create_base ──
server.registerTool(
  'create_base',
  {
    title: 'Создать базу',
    description: 'Создаёт пользовательскую базу с колонками и (опционально) начальными строками.',
    inputSchema: {
      name: z.string().describe('название базы'),
      columns: z.array(z.object({
        label: z.string(),
        type: z.enum(['text', 'number', 'select', 'url', 'long-text']).optional(),
        filterable: z.boolean().optional(),
      })).describe('колонки базы'),
      rows: z.array(z.record(z.string(), z.any())).optional().describe('строки: объекты по label или key колонки'),
      parent: z.string().optional().describe('id раздела, внутрь которого вложить базу (например it, ai, market, workforce)'),
    },
  },
  async ({ name, columns, rows, parent }) => {
    const cols = normalizeColumns(columns);
    if (!name?.trim()) return fail('нужно название');
    if (!cols.length) return fail('нужна хотя бы одна колонка');
    const { data: existing } = await supa.from('bases').select('id');
    const known = new Set([...(existing ?? []).map((b) => b.id), ...BUILTIN_IDS]);
    if (parent && !known.has(parent)) return fail(`нет базы с id ${parent}`);
    const id = slugId(name, known);
    const row = { id, name: name.trim(), tone: 'sage', columns: cols };
    if (parent) row.parent = parent;
    const { error } = await supa.from('bases').insert(row);
    if (error) return fail(error.message);
    let imported = 0;
    if (rows?.length) {
      const payload = rows.map((r) => ({ base_id: id, data: mapRow(cols, r) })).filter((p) => Object.keys(p.data).length);
      if (payload.length) {
        const { error: e2 } = await supa.from('base_records').insert(payload);
        if (e2) return fail(`база создана (${id}), но строки не вставились: ${e2.message}`);
        imported = payload.length;
      }
    }
    return ok({ id, name: name.trim(), parent: parent ?? null, columns: cols.map((c) => c.key), imported });
  },
);

// ── add_rows ──
server.registerTool(
  'add_rows',
  {
    title: 'Добавить строки',
    description: 'Добавляет строки в существующую пользовательскую базу.',
    inputSchema: {
      base: z.string().describe('id базы'),
      rows: z.array(z.record(z.string(), z.any())).describe('строки-объекты (по label или key колонки)'),
    },
  },
  async ({ base, rows }) => {
    if (BUILTIN_IDS.has(base)) return fail('во встроенные базы писать нельзя');
    const { data: b, error } = await supa.from('bases').select('columns').eq('id', base).maybeSingle();
    if (error) return fail(error.message);
    if (!b) return fail('база не найдена');
    const cols = b.columns ?? [];
    const payload = rows.map((r) => ({ base_id: base, data: mapRow(cols, r) })).filter((p) => Object.keys(p.data).length);
    if (!payload.length) return ok({ added: 0 });
    const { error: e2 } = await supa.from('base_records').insert(payload);
    if (e2) return fail(e2.message);
    return ok({ added: payload.length });
  },
);

// ── query_records ──
server.registerTool(
  'query_records',
  {
    title: 'Читать записи',
    description: 'Возвращает записи базы (встроенной или пользовательской) с опциональным текстовым поиском.',
    inputSchema: {
      base: z.string().describe('id базы (market/ai/it/workforce или id пользовательской)'),
      search: z.string().optional().describe('подстрока для поиска'),
      limit: z.number().int().positive().max(500).optional().describe('макс. записей (по умолчанию 50)'),
      offset: z.number().int().nonnegative().optional().describe('смещение страницы (по умолчанию 0)'),
    },
  },
  async ({ base, search, limit, offset }) => {
    const lim = limit ?? 50;
    const off = offset ?? 0;
    const q = (search ?? '').trim().toLowerCase();
    if (BUILTIN_IDS.has(base)) {
      const def = BUILTIN_BASES.find((b) => b.id === base);
      const { data, error } = await supa.from('products').select('data').order('id');
      if (error) return fail(error.message);
      let recs = (data ?? []).map((r) => ({ ...r.data, section: r.data.section ?? sectionFor(r.data.vertical) }));
      if (def.section) recs = recs.filter((r) => r.section === def.section);
      if (q) recs = recs.filter((r) => Object.values(r).filter((v) => typeof v === 'string').join(' ').toLowerCase().includes(q));
      const page = recs.slice(off, off + lim);
      return ok({ base, total: recs.length, offset: off, hasMore: off + page.length < recs.length, records: page.map((r) => ({ id: r.id, name: r.name, verdict: r.verdict, vertical: r.vertical, section: r.section, url: r.url })) });
    }
    // база должна быть живой (не в корзине) — иначе после delete_base записи
    // всё ещё читались бы напрямую по id базы в обход list_bases
    const live = await loadCustomBase(base);
    if (live.error) return fail(live.error);
    const { data, error } = await liveRecords(base);
    if (error) return fail(error.message);
    let recs = (data ?? []).map((r) => ({ id: r.id, ...r.data }));
    if (q) recs = recs.filter((r) => Object.values(r).filter((v) => typeof v === 'string').join(' ').toLowerCase().includes(q));
    const page = recs.slice(off, off + lim);
    return ok({ base, total: recs.length, offset: off, hasMore: off + page.length < recs.length, records: page });
  },
);

// ── update_record ──
server.registerTool(
  'update_record',
  {
    title: 'Обновить запись',
    description: 'Меняет поля одной строки в пользовательской базе.',
    inputSchema: {
      base: z.string(),
      id: z.string().describe('id строки'),
      data: z.record(z.string(), z.any()).describe('поля для обновления (по key колонки)'),
    },
  },
  async ({ base, id, data }) => {
    if (BUILTIN_IDS.has(base)) return fail('встроенные базы только для чтения');
    const { data: cur, error } = await supa.from('base_records').select('data').eq('id', id).eq('base_id', base).maybeSingle();
    if (error) return fail(error.message);
    if (!cur) return fail('строка не найдена');
    const merged = { ...cur.data, ...data };
    const { error: e2 } = await supa.from('base_records').update({ data: merged }).eq('id', id);
    if (e2) return fail(e2.message);
    return ok({ id, data: merged });
  },
);

// ── catalog_search ──
server.registerTool(
  'catalog_search',
  {
    title: 'Поиск по каталогу',
    description: 'Ищет компании в каталоге продуктов (412 записей) по тексту и разделу.',
    inputSchema: {
      query: z.string().optional().describe('текстовый запрос'),
      section: z.enum(['AI', 'IT', 'WorkOS']).optional(),
      limit: z.number().int().positive().max(100).optional(),
      offset: z.number().int().nonnegative().optional().describe('смещение страницы (по умолчанию 0)'),
    },
  },
  async ({ query, section, limit, offset }) => {
    const { data, error } = await supa.from('products').select('data').order('id');
    if (error) return fail(error.message);
    let recs = (data ?? []).map((r) => ({ ...r.data, section: r.data.section ?? sectionFor(r.data.vertical) }));
    if (section) recs = recs.filter((r) => r.section === section);
    const q = (query ?? '').trim().toLowerCase();
    if (q) recs = recs.filter((r) => Object.values(r).filter((v) => typeof v === 'string').join(' ').toLowerCase().includes(q));
    const off = offset ?? 0;
    const page = recs.slice(off, off + (limit ?? 20));
    return ok({ total: recs.length, offset: off, hasMore: off + page.length < recs.length, results: page.map((r) => ({ id: r.id, name: r.name, verdict: r.verdict, section: r.section, vertical: r.vertical, url: r.url })) });
  },
);

// ── свободные модели OpenRouter (авто-выбор + fallback) ──
// OPENROUTER_MODEL, если задан, перекрывает автовыбор фиксированной моделью.
// Иначе тянем список моделей OpenRouter, оставляем только бесплатные (price
// 0/0), перемешиваем и пробуем по очереди, пока какая-то не ответит. Список
// кэшируется на час; на сбое сети — пустой массив, тогда вызывающий код падает
// на эвристику, а не на платную модель.
const FREE_MODELS_TTL_MS = 60 * 60 * 1000;
let freeModelsCache = null; // { ids, at }

function isZeroPrice(v) {
  return typeof v === 'string' && v.trim() !== '' && Number(v) === 0;
}

function pickFreeIds(models) {
  return (Array.isArray(models) ? models : [])
    .filter((m) => m?.id && m.pricing && isZeroPrice(m.pricing.prompt) && isZeroPrice(m.pricing.completion))
    .map((m) => String(m.id));
}

async function freeModelIds() {
  if (freeModelsCache && Date.now() - freeModelsCache.at < FREE_MODELS_TTL_MS) return freeModelsCache.ids;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: process.env.OPENROUTER_API_KEY ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } : {},
    });
    if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
    const data = await res.json();
    const ids = pickFreeIds(data?.data);
    freeModelsCache = { ids, at: Date.now() };
    return ids;
  } catch (e) {
    console.error('free model list fetch failed:', e);
    return freeModelsCache?.ids ?? [];
  }
}

async function modelCandidates(limit = 6) {
  const override = process.env.OPENROUTER_MODEL?.trim();
  if (override) return [override];
  const ids = [...(await freeModelIds())];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, limit);
}

async function openrouterChatCandidates(body, candidates) {
  for (const model of candidates) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, model }),
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.error(`model ${model} failed, trying next:`, e);
    }
  }
  return null;
}

// ── research_decompose ──
const SYS = 'Ты — старший аналитик рынка AI-продуктов. Разложи запрос на 8–10 конкретных, взаимно не пересекающихся, проверяемых подтем на русском. Каждая — короткая формулировка (до ~8 слов). Верни ТОЛЬКО JSON-массив строк.';
function heuristic(prompt) {
  const t = prompt.trim().replace(/\s+/g, ' ').slice(0, 80) || 'тема';
  return [`Обзор: ${t}`, `Ключевые игроки: ${t}`, `Технологии: ${t}`, `Рынок и тренды: ${t}`, `Монетизация: ${t}`, `Риски: ${t}`, `Кейсы: ${t}`, `Источники: ${t}`];
}
function parseList(text) {
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s === -1 || e === -1) return [];
  try { const a = JSON.parse(text.slice(s, e + 1)); return Array.isArray(a) ? a.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, 12) : []; }
  catch { return []; }
}
server.registerTool(
  'research_decompose',
  {
    title: 'Декомпозиция запроса',
    description: 'Разбивает исследовательский запрос на подтемы (Claude/OpenRouter при наличии ключа, иначе эвристика).',
    inputSchema: { prompt: z.string().describe('что исследуем') },
  },
  async ({ prompt }) => {
    if (!prompt?.trim()) return fail('пустой запрос');
    const user = `Запрос: "${prompt}"\n\nВерни ТОЛЬКО JSON-массив строк.`;
    try {
      if (process.env.OPENROUTER_API_KEY) {
        const candidates = await modelCandidates();
        if (candidates.length) {
          const j = await openrouterChatCandidates(
            { max_tokens: 1024, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] },
            candidates,
          );
          const subs = parseList(j?.choices?.[0]?.message?.content ?? '');
          if (subs.length >= 3) return ok({ source: 'openrouter', subtopics: subs });
        }
      }
    } catch (e) { console.error('decompose provider failed:', e); }
    return ok({ source: 'heuristic', subtopics: heuristic(prompt) });
  },
);

// та же инструкция как вызываемый промпт — на случай, если клиент не показывает
// server instructions или пользователь хочет дёрнуть её явно
server.registerPrompt(
  'create-base',
  {
    title: 'Завести базу под тему',
    description: 'Как создать базу знаний под новую тематику и наполнить её из каталога',
    argsSchema: { topic: z.string().optional().describe('тема будущей базы') },
  },
  ({ topic }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: topic
            ? `${INSTRUCTIONS}\n\nТема: ${topic}`
            : INSTRUCTIONS,
        },
      },
    ],
  }),
);

// исследование темы на подписке клиента: веб-поиск делает сам клиент
server.registerPrompt(
  'research-topic',
  {
    title: 'Исследовать тему',
    description: 'Провести исследование своими средствами веб-поиска и сохранить в базу',
    argsSchema: { topic: z.string().describe('что исследуем') },
  },
  ({ topic }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            `${INSTRUCTIONS}\n\n` +
            `Проведи исследование по теме: "${topic}".\n` +
            'Веб-поиск делай своими инструментами, каталог используй для сверки, ' +
            'в конце предложи сохранить найденное в базу.',
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('ai-researcher-mcp ready');
