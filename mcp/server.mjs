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
// получает её при подключении и работает по ней в любом чате.
const INSTRUCTIONS = `Базы знаний AiVocado (витрина AI-Researcher).

Дерево баз: у каждой свои колонки и строки, базы вкладываются друг в друга через parent.
Задача коннектора — заводить базы под новые темы и наполнять их РЕАЛЬНЫМИ данными
из каталога продуктов, а не выдуманными.

Порядок работы, когда просят «заведи базу под …», «собери базу по теме»,
«добавь раздел», «что есть в каталоге по …», «наполни базу»:
1. list_bases — посмотри, что уже есть. Не плоди дубль темы: если близкая база
   существует, предложи дополнить её.
2. Тема широкая — research_decompose по запросу пользователя, чтобы увидеть срезы.
3. catalog_search по ключевым словам темы (можно с section: AI / IT / WorkOS).
   Это единственный источник компаний — строки берутся отсюда.
4. Покажи план ДО записи: название базы, колонки, куда вкладываем (parent),
   сколько строк. Дождись подтверждения.
5. create_base — с колонками и, если строки отобраны, сразу с rows.
6. Дальше add_rows; правки отдельных полей — update_record.
7. Отчитайся: id базы, число строк, ссылка
   https://ai-reesearcher.vercel.app/?base=<id>

Колонки по умолчанию для темы «продукты/конкуренты»:
Название (text) · Вертикаль (select, filterable) · Вердикт (select, filterable) ·
Ссылка (url) · Заметка (text).
Типы: text, number, select, url, long-text. filterable ставь для select — по ним
появляются фильтры и уровни группировки. Числа передавай как есть.

Чего не делать:
- Не выдумывай компании. Всё, что идёт в строки, приходит из catalog_search.
  Нет совпадений по подтеме — так и скажи: «новая ниша, в каталоге пусто».
- Строки — объекты по названию или ключу колонки, не позиционные массивы:
  {"Название": "Figma", "Цена": 15}.
- Встроенные базы (market, ai, it, workforce) только для чтения — это срезы
  каталога. Писать можно лишь в пользовательские базы.
- Родительский раздел показывает и то, что вложено (строки помечены «Из базы») —
  это ожидаемо, не считай дублем.
- Слаг id идёт от названия: у русских имён id тоже русский, в URL его кодируй.
  Одинаковые названия получают суффикс -2, молча ничего не перезаписывается.

База встреч Fathom — отдельный коннектор со своими инструментами. Запросы про
встречи, транскрипты и участников относятся к нему, базы знаний там не создаются.`;

const server = new McpServer(
  { name: 'ai-researcher', version: '0.2.0' },
  { instructions: INSTRUCTIONS },
);

// ── list_bases ──
server.registerTool(
  'list_bases',
  { title: 'Список баз', description: 'Все базы витрины: 4 встроенных (срезы каталога) + пользовательские.' },
  async () => {
    const { data, error } = await supa.from('bases').select('id, name, tone, columns').order('created_at');
    if (error) return fail(error.message);
    const custom = (data ?? []).map((b) => ({ id: b.id, name: b.name, builtin: false, columns: (b.columns ?? []).map((c) => c.key) }));
    const builtin = BUILTIN_BASES.map((b) => ({ id: b.id, name: b.name, builtin: true }));
    return ok({ bases: [...builtin, ...custom] });
  },
);

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
    },
  },
  async ({ name, columns, rows }) => {
    const cols = normalizeColumns(columns);
    if (!name?.trim()) return fail('нужно название');
    if (!cols.length) return fail('нужна хотя бы одна колонка');
    const { data: existing } = await supa.from('bases').select('id');
    const id = slugId(name, new Set([...(existing ?? []).map((b) => b.id), ...BUILTIN_IDS]));
    const { error } = await supa.from('bases').insert({ id, name: name.trim(), tone: 'sage', columns: cols });
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
    return ok({ id, name: name.trim(), columns: cols.map((c) => c.key), imported });
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
    },
  },
  async ({ base, search, limit }) => {
    const lim = limit ?? 50;
    const q = (search ?? '').trim().toLowerCase();
    if (BUILTIN_IDS.has(base)) {
      const def = BUILTIN_BASES.find((b) => b.id === base);
      const { data, error } = await supa.from('products').select('data');
      if (error) return fail(error.message);
      let recs = (data ?? []).map((r) => ({ ...r.data, section: r.data.section ?? sectionFor(r.data.vertical) }));
      if (def.section) recs = recs.filter((r) => r.section === def.section);
      if (q) recs = recs.filter((r) => Object.values(r).filter((v) => typeof v === 'string').join(' ').toLowerCase().includes(q));
      return ok({ base, total: recs.length, records: recs.slice(0, lim).map((r) => ({ id: r.id, name: r.name, verdict: r.verdict, vertical: r.vertical, section: r.section, url: r.url })) });
    }
    const { data, error } = await supa.from('base_records').select('id, data').eq('base_id', base);
    if (error) return fail(error.message);
    let recs = (data ?? []).map((r) => ({ id: r.id, ...r.data }));
    if (q) recs = recs.filter((r) => Object.values(r).filter((v) => typeof v === 'string').join(' ').toLowerCase().includes(q));
    return ok({ base, total: recs.length, records: recs.slice(0, lim) });
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
    },
  },
  async ({ query, section, limit }) => {
    const { data, error } = await supa.from('products').select('data');
    if (error) return fail(error.message);
    let recs = (data ?? []).map((r) => ({ ...r.data, section: r.data.section ?? sectionFor(r.data.vertical) }));
    if (section) recs = recs.filter((r) => r.section === section);
    const q = (query ?? '').trim().toLowerCase();
    if (q) recs = recs.filter((r) => Object.values(r).filter((v) => typeof v === 'string').join(' ').toLowerCase().includes(q));
    return ok({ total: recs.length, results: recs.slice(0, limit ?? 20).map((r) => ({ id: r.id, name: r.name, verdict: r.verdict, section: r.section, vertical: r.vertical, url: r.url })) });
  },
);

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
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5', max_tokens: 1024, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }),
        });
        if (res.ok) {
          const j = await res.json();
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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('ai-researcher-mcp ready');
