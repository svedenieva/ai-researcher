import { getDataSource } from '@/lib/datasource';
import { BASES } from '@/lib/datasource/bases';
import { getCustomStore } from '@/lib/datasource/customStore';
import type { ColumnDef } from '@/lib/datasource/types';
// @ts-expect-error — общий текст правил, один на stdio и HTTP
import { INSTRUCTIONS } from '@/lib/mcp/instructions.mjs';

// MCP по HTTP (JSON-RPC 2.0) прямо в приложении: человек добавляет одну ссылку
// с личным токеном — ни Node, ни файлов, ни ключа Supabase у него на машине.
// Кто пришёл, определяем по токену, поэтому каждый видит свои базы и общие.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

// MCP_TOKENS = "токен:почта,токен2:почта2"
function emailForToken(token: string | null): string | null {
  if (!token) return null;
  const map = process.env.MCP_TOKENS ?? '';
  for (const pair of map.split(',')) {
    const i = pair.indexOf(':');
    if (i === -1) continue;
    if (pair.slice(0, i).trim() === token) return pair.slice(i + 1).trim();
  }
  return null;
}

function tokenFrom(request: Request): string | null {
  const auth = request.headers.get('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return new URL(request.url).searchParams.get('token');
}

// ── описания инструментов (схемы в формате JSON Schema) ────────
const TOOLS = [
  {
    name: 'list_bases',
    description: 'Все базы витрины: встроенные срезы каталога + доступные пользователю.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_base',
    description: 'Создаёт базу с колонками и (опционально) начальными строками.',
    inputSchema: {
      type: 'object',
      required: ['name', 'columns'],
      properties: {
        name: { type: 'string', description: 'название базы' },
        parent: { type: 'string', description: 'id базы-родителя (необязательно)' },
        columns: {
          type: 'array',
          description: 'колонки базы',
          items: {
            type: 'object',
            required: ['label'],
            properties: {
              label: { type: 'string' },
              type: { type: 'string', enum: ['text', 'number', 'select', 'url', 'long-text'] },
              filterable: { type: 'boolean' },
            },
          },
        },
        rows: {
          type: 'array',
          description: 'строки: объекты по label или key колонки',
          items: { type: 'object' },
        },
      },
    },
  },
  {
    name: 'add_rows',
    description: 'Добавляет строки в существующую базу.',
    inputSchema: {
      type: 'object',
      required: ['base', 'rows'],
      properties: {
        base: { type: 'string', description: 'id базы' },
        rows: { type: 'array', items: { type: 'object' } },
      },
    },
  },
  {
    name: 'query_records',
    description: 'Записи базы с необязательным текстовым поиском.',
    inputSchema: {
      type: 'object',
      required: ['base'],
      properties: {
        base: { type: 'string' },
        search: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'update_record',
    description: 'Меняет поля одной строки.',
    inputSchema: {
      type: 'object',
      required: ['base', 'id', 'data'],
      properties: { base: { type: 'string' }, id: { type: 'string' }, data: { type: 'object' } },
    },
  },
  {
    name: 'catalog_search',
    description: 'Поиск компаний в каталоге продуктов, можно ограничить разделом.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        section: { type: 'string', enum: ['AI', 'IT', 'WorkOS'] },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'research_decompose',
    description: 'Разбивает исследовательский запрос на подтемы.',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: { prompt: { type: 'string' } },
    },
  },
];

const text = (obj: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const failed = (msg: string) => ({ content: [{ type: 'text', text: `Ошибка: ${msg}` }], isError: true });

function normalizeColumns(input: unknown): ColumnDef[] {
  const cols: ColumnDef[] = [];
  const used = new Set<string>();
  for (const raw of Array.isArray(input) ? input : []) {
    const label = String((raw as { label?: unknown })?.label ?? '').trim();
    if (!label) continue;
    let key = label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/(^_|_$)/g, '') || `col${cols.length}`;
    while (used.has(key)) key = `${key}_`;
    used.add(key);
    const t = (raw as { type?: unknown })?.type;
    const type: ColumnDef['type'] =
      t === 'number' || t === 'url' || t === 'long-text' || t === 'select' ? t : 'text';
    cols.push({
      key,
      label,
      type,
      sortable: true,
      filterable: Boolean((raw as { filterable?: unknown })?.filterable) && type !== 'long-text' && type !== 'url',
    });
  }
  return cols;
}

// строка-объект (по label или key) → объект по ключам колонок, числа приводим
function mapRow(cols: ColumnDef[], row: unknown): Record<string, unknown> {
  const src = (row ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const col of cols) {
    const v = src[col.key] ?? src[col.label];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    data[col.key] = col.type === 'number' ? Number(String(v).replace(',', '.')) : v;
  }
  return data;
}

async function callTool(name: string, args: Record<string, unknown>, me: string) {
  const store = getCustomStore();
  // реестр общий: доступ даёт токен, а не владелец базы — так же, как на сайте
  const visible = async () => store.listBases();

  switch (name) {
    case 'list_bases': {
      const mine = await visible();
      return text({
        bases: [
          ...BASES.map((b) => ({ id: b.id, name: b.name, builtin: true })),
          ...mine.map((b) => ({
            id: b.id,
            name: b.name,
            builtin: false,
            parent: b.parent,
            columns: b.columns.map((c) => c.key),
          })),
        ],
      });
    }

    case 'create_base': {
      const nm = String(args.name ?? '').trim();
      const cols = normalizeColumns(args.columns);
      if (!nm) return failed('нужно название');
      if (!cols.length) return failed('нужна хотя бы одна колонка');
      const parent = typeof args.parent === 'string' && args.parent ? args.parent : null;
      const base = await store.createBase({ name: nm, columns: cols, parent, owner: me });
      const rows = Array.isArray(args.rows) ? args.rows.map((r) => mapRow(cols, r)).filter((d) => Object.keys(d).length) : [];
      const imported = rows.length ? await store.addRecords(base.id, rows) : 0;
      return text({ id: base.id, name: base.name, columns: cols.map((c) => c.key), imported });
    }

    case 'add_rows': {
      const id = String(args.base ?? '');
      if (BUILTIN_IDS.has(id)) return failed('во встроенные базы писать нельзя');
      const base = await store.getBase(id);
      if (!base) return failed('база не найдена');
      const rows = Array.isArray(args.rows) ? args.rows.map((r) => mapRow(base.columns, r)).filter((d) => Object.keys(d).length) : [];
      const added = rows.length ? await store.addRecords(id, rows) : 0;
      return text({ added });
    }

    case 'query_records': {
      const id = String(args.base ?? '');
      const limit = Number(args.limit ?? 50);
      const q = String(args.search ?? '').trim().toLowerCase();
      const match = (r: Record<string, unknown>) =>
        !q ||
        Object.values(r).filter((v) => typeof v === 'string').join(' ').toLowerCase().includes(q);

      if (BUILTIN_IDS.has(id)) {
        const def = BASES.find((b) => b.id === id)!;
        let recs = await getDataSource().list(def.section ? { filters: { section: def.section } } : undefined);
        recs = recs.filter(match);
        return text({ base: id, total: recs.length, records: recs.slice(0, limit) });
      }
      const base = await store.getBase(id);
      if (!base) return failed('база не найдена');
      const recs = (await store.listRecords(id)).filter(match);
      return text({ base: id, total: recs.length, records: recs.slice(0, limit) });
    }

    case 'update_record': {
      const id = String(args.base ?? '');
      if (BUILTIN_IDS.has(id)) return failed('встроенные базы только для чтения');
      const base = await store.getBase(id);
      if (!base) return failed('база не найдена');
      const rec = await store.updateRecord(id, String(args.id ?? ''), (args.data ?? {}) as Record<string, unknown>);
      return rec ? text(rec) : failed('строка не найдена');
    }

    case 'catalog_search': {
      const q = String(args.query ?? '').trim().toLowerCase();
      const section = typeof args.section === 'string' ? args.section : undefined;
      let recs = await getDataSource().list(section ? { filters: { section } } : undefined);
      if (q) {
        recs = recs.filter((r) =>
          Object.values(r).filter((v) => typeof v === 'string').join(' ').toLowerCase().includes(q),
        );
      }
      return text({
        total: recs.length,
        results: recs.slice(0, Number(args.limit ?? 20)).map((r) => ({
          id: r.id, name: r.name, verdict: r.verdict, section: r.section, vertical: r.vertical, url: r.url,
        })),
      });
    }

    case 'research_decompose': {
      const prompt = String(args.prompt ?? '').trim();
      if (!prompt) return failed('пустой запрос');
      // тот же роут, что использует сайт, — правила декомпозиции в одном месте
      const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const res = await fetch(`${origin}/api/research/decompose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const body = await res.json();
      return text({ source: body.source, subtopics: body.subtopics ?? [] });
    }

    default:
      return failed(`неизвестный инструмент: ${name}`);
  }
}

// Часть клиентов ждёт ответ потоком (text/event-stream), часть — обычным JSON.
// Отвечаем в том формате, который клиент запросил, иначе он молча не подключится.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
};

function envelope(payload: unknown, wantsStream: boolean): Response {
  if (!wantsStream) return Response.json(payload, { headers: CORS });
  return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request): Promise<Response> {
  const me = emailForToken(tokenFrom(request));
  const wantsStream = (request.headers.get('accept') ?? '').includes('text/event-stream');

  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return envelope({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, wantsStream);
  }

  const { id, method, params = {} } = body;
  const reply = (result: unknown) => envelope({ jsonrpc: '2.0', id, result }, wantsStream);
  const errorReply = (code: number, message: string) =>
    envelope({ jsonrpc: '2.0', id, error: { code, message } }, wantsStream);

  // уведомления (без id) ответа не требуют
  if (id === undefined || id === null) return new Response(null, { status: 202, headers: CORS });

  if (method === 'initialize') {
    // Отвечаем той версией протокола, которую попросил клиент, если она нам
    // знакома. Раньше здесь стояла жёстко 2024-11-05: клиент просил новую,
    // получал старую и вправе был на этом оборваться — «not connected» без
    // единой внятной ошибки. Наш обмен по сути одинаков во всех трёх версиях.
    const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
    const KNOWN = ['2025-06-18', '2025-03-26', '2024-11-05'];
    return reply({
      protocolVersion: KNOWN.includes(asked) ? asked : KNOWN[0],
      capabilities: { tools: {}, prompts: {} },
      serverInfo: { name: 'ai-researcher', version: '0.3.0' },
      instructions: INSTRUCTIONS,
    });
  }

  // всё остальное — только по действующему токену
  if (!me) return errorReply(-32001, 'Нужен действующий токен доступа');

  if (method === 'tools/list') return reply({ tools: TOOLS });

  if (method === 'tools/call') {
    const name = String((params as { name?: unknown }).name ?? '');
    const args = ((params as { arguments?: unknown }).arguments ?? {}) as Record<string, unknown>;
    try {
      return reply(await callTool(name, args, me));
    } catch (e) {
      return reply(failed(e instanceof Error ? e.message : 'сбой инструмента'));
    }
  }

  if (method === 'prompts/list') {
    return reply({
      prompts: [
        { name: 'create-base', description: 'Как завести базу под новую тему', arguments: [{ name: 'topic', required: false }] },
        { name: 'research-topic', description: 'Провести исследование и сохранить в базу', arguments: [{ name: 'topic', required: true }] },
      ],
    });
  }

  if (method === 'prompts/get') {
    const name = String((params as { name?: unknown }).name ?? '');
    const topic = String(((params as { arguments?: Record<string, unknown> }).arguments ?? {}).topic ?? '');
    const body =
      name === 'research-topic'
        ? `${INSTRUCTIONS}\n\nПроведи исследование по теме: "${topic}". Веб-поиск делай своими инструментами, каталог используй для сверки, в конце предложи сохранить найденное в базу.`
        : topic
          ? `${INSTRUCTIONS}\n\nТема: ${topic}`
          : INSTRUCTIONS;
    return reply({ messages: [{ role: 'user', content: { type: 'text', text: body } }] });
  }

  return errorReply(-32601, `Метод не поддерживается: ${method}`);
}

export async function GET(request: Request): Promise<Response> {
  // Клиент, открывающий поток событий, должен получить явный отказ: сервер
  // отвечает на каждый запрос сразу и отдельный канал не держит. Молчаливый
  // JSON вместо этого подвешивает подключение.
  if ((request.headers.get('accept') ?? '').includes('text/event-stream')) {
    return new Response('SSE stream not offered', { status: 405, headers: CORS });
  }
  // обычное открытие в браузере — страничка самопроверки
  const me = emailForToken(tokenFrom(request));
  return Response.json(
    {
      server: 'ai-researcher',
      transport: 'http/json-rpc',
      authorized: Boolean(me),
      user: me,
      tools: TOOLS.map((t) => t.name),
    },
    { headers: CORS },
  );
}
