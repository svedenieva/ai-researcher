// Шим сетевого слоя: заменяет @/lib/api. Держит мутабельную in-memory базу на
// мок-данных, чтобы настоящие компоненты работали (правки, добавление, удаление,
// колонки, фильтры) без сервера. Ничего наружу не уходит.
import type { CatalogRecord, ColumnDef } from '@/lib/datasource/types';
import { recordMode } from '@/lib/mode';
import { MOCK_BASES, DEFAULT_MOCK_BASE, type MockBase } from '../mock/data';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// живое хранилище (копия моков, которую мутируют ручки)
const db = new Map<string, { base: MockBase; columns: ColumnDef[]; records: CatalogRecord[] }>();
for (const b of MOCK_BASES) db.set(b.id, { base: b, columns: [...b.columns], records: b.records.map((r) => ({ ...r })) });
function slot(id: string) {
  return db.get(id) ?? db.get(DEFAULT_MOCK_BASE)!;
}

let seq = 100;

function basesList() {
  return MOCK_BASES.map((b) => ({
    id: b.id, name: b.name, tone: b.tone, builtin: b.builtin, parent: b.parent,
    owner: b.owner, state: b.state ?? null, query: b.query ?? null,
  }));
}

function parseUrl(u: string): { path: string; params: URLSearchParams } {
  const s = String(u);
  const q = s.indexOf('?');
  return { path: q === -1 ? s : s.slice(0, q), params: new URLSearchParams(q === -1 ? '' : s.slice(q + 1)) };
}

export async function apiJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const { path, params } = parseUrl(String(input));
  const method = (init?.method ?? 'GET').toUpperCase();
  let body: Record<string, unknown> = {};
  try { body = init?.body ? JSON.parse(String(init.body)) : {}; } catch { /* ignore */ }
  const baseId = String(body.base ?? params.get('base') ?? DEFAULT_MOCK_BASE);

  // ── GET /api/bases ────────────────────────────────────────────────
  if (path === '/api/bases') {
    if (method === 'POST') {
      const id = `base-${++seq}`;
      const nb: MockBase = { id, name: String(body.name ?? 'Новая база'), tone: 'sage', builtin: false, parent: (body.parent as string) ?? null, owner: 'me@aivocado', columns: (body.columns as ColumnDef[]) ?? [], records: [] };
      MOCK_BASES.push(nb); db.set(id, { base: nb, columns: [...nb.columns], records: [] });
      return { base: { id, name: nb.name, tone: nb.tone, builtin: false, parent: nb.parent, owner: nb.owner } } as T;
    }
    return { bases: basesList() } as T;
  }

  // ── /api/records (CRUD) + /api/records/* (стабы) ──────────────────
  if (path === '/api/records') {
    const s = slot(baseId);
    if (method === 'GET') {
      // фильтр по режиму (Все / Исследование / Эталон) — как на сервере (ТР-БД-13)
      const mode = params.get('mode');
      const recs = mode ? s.records.filter((r) => recordMode(r) === mode) : s.records;
      return { columns: s.columns, records: recs, total: recs.length, facets: {}, sharing: false } as T;
    }
    if (method === 'POST') {
      const rec = { id: `r-${++seq}`, ...(body.data as object) } as CatalogRecord;
      s.records.push(rec); return { record: rec } as T;
    }
    if (method === 'PATCH') {
      const rec = s.records.find((r) => String(r.id) === String(body.id));
      if (rec) Object.assign(rec, body.data as object);
      return { record: rec ?? null } as T;
    }
    if (method === 'DELETE') {
      const ids = new Set((body.ids as string[])?.map(String) ?? []);
      const before = s.records.length;
      s.records = s.records.filter((r) => !ids.has(String(r.id)));
      return { removed: before - s.records.length } as T;
    }
  }
  if (path === '/api/records/share-link') return { url: `${location.origin}/p/mock-share-token` } as T;
  if (path === '/api/records/dedupe') return { groups: 0, removed: 0, filled: 0, tagsFixed: 0 } as T;
  if (path === '/api/records/check-links') return { urls: 0, dead: 0, quotesChecked: 0, quotesMissing: 0, quotesSkipped: 0 } as T;
  if (path === '/api/records/import') return { replaced: 0, added: 0 } as T;
  if (path === '/api/records/scrape') return { added: 0 } as T;
  if (path === '/api/records/reorder') return { ok: true } as T;

  // ── /api/columns (мутации схемы) ──────────────────────────────────
  if (path === '/api/columns') {
    const s = slot(baseId);
    const action = String(body.action ?? '');
    if (action === 'add' && body.column) {
      const c = body.column as { label: string; type: ColumnDef['type'] };
      s.columns.push({ key: c.label.toLowerCase().replace(/\s+/g, '_') || `col${s.columns.length}`, label: c.label, type: c.type });
    } else if (action === 'update' && body.key) {
      const col = s.columns.find((c) => c.key === body.key);
      if (col) Object.assign(col, body.patch as object);
    } else if (action === 'delete' && body.key) {
      s.columns = s.columns.filter((c) => c.key !== body.key);
    } else if (action === 'reorder' && Array.isArray(body.keys)) {
      const order = body.keys as string[];
      s.columns = [...s.columns].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    }
    return { base: { id: baseId } } as T;
  }

  // ── /api/favorites ────────────────────────────────────────────────
  if (path === '/api/favorites') return (method === 'GET' ? { favorites: [] } : { ok: true }) as T;
  if (path.startsWith('/api/bases/access')) return { emails: [] } as T;

  // всё остальное — тихий ok, чтобы ничего не падало
  return {} as T;
}

export function apiSend<T = unknown>(url: string, method: string, data: unknown): Promise<T> {
  return apiJson<T>(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
