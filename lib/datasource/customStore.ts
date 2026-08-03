import { createClient } from '@supabase/supabase-js';
import type { ColumnDef, CatalogRecord } from './types';

// Пользовательские базы (цель №1): логин → создать базу → задать колонки →
// наполнять строками. Определения баз и их строки хранятся отдельно от каталога
// продуктов. Два бэкенда с одинаковым интерфейсом:
//   - Supabase (прод): таблицы `bases` и `base_records`;
//   - in-memory (лок. разработка): живёт в процессе dev-сервера.

export interface CustomBase {
  id: string;
  name: string;
  tone: 'sage' | 'teal' | 'blue' | 'amber';
  columns: ColumnDef[];
}

export interface NewBase {
  name: string;
  tone?: CustomBase['tone'];
  columns: ColumnDef[];
}

export interface CustomStore {
  listBases(): Promise<CustomBase[]>;
  getBase(id: string): Promise<CustomBase | null>;
  createBase(def: NewBase): Promise<CustomBase>;
  listRecords(baseId: string): Promise<CatalogRecord[]>;
  addRecord(baseId: string, data: Record<string, unknown>): Promise<CatalogRecord>;
  addRecords(baseId: string, rows: Record<string, unknown>[]): Promise<number>;
  updateRecord(baseId: string, id: string, patch: Record<string, unknown>): Promise<CatalogRecord | null>;
}

const TONES: CustomBase['tone'][] = ['teal', 'blue', 'amber', 'sage'];

// url-безопасный слаг из названия + короткий суффикс (уникальность)
function slugId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 24) || 'base';
  let id = base;
  let n = 1;
  while (taken.has(id)) id = `${base}-${++n}`;
  return id;
}

// ── in-memory (dev) ─────────────────────────────────────────────
class MemoryCustomStore implements CustomStore {
  private bases: CustomBase[] = [];
  private rows: Record<string, CatalogRecord[]> = {};
  private seq = 0;

  async listBases() {
    return this.bases;
  }
  async getBase(id: string) {
    return this.bases.find((b) => b.id === id) ?? null;
  }
  async createBase(def: NewBase) {
    const id = slugId(def.name, new Set(this.bases.map((b) => b.id)));
    const base: CustomBase = {
      id,
      name: def.name,
      tone: def.tone ?? TONES[this.bases.length % TONES.length],
      columns: def.columns,
    };
    this.bases.push(base);
    this.rows[id] = [];
    return base;
  }
  async listRecords(baseId: string) {
    return this.rows[baseId] ?? [];
  }
  async addRecord(baseId: string, data: Record<string, unknown>) {
    const record = { id: `r${++this.seq}`, ...data } as CatalogRecord;
    (this.rows[baseId] ??= []).push(record);
    return record;
  }
  async addRecords(baseId: string, rows: Record<string, unknown>[]) {
    const bucket = (this.rows[baseId] ??= []);
    for (const data of rows) bucket.push({ id: `r${++this.seq}`, ...data } as CatalogRecord);
    return rows.length;
  }
  async updateRecord(baseId: string, id: string, patch: Record<string, unknown>) {
    const row = (this.rows[baseId] ?? []).find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, patch);
    return row;
  }
}

// ── Supabase (prod) ─────────────────────────────────────────────
class SupabaseCustomStore implements CustomStore {
  private readonly client;
  constructor(url: string, key: string) {
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }
  async listBases(): Promise<CustomBase[]> {
    const { data, error } = await this.client
      .from('bases')
      .select('id, name, tone, columns')
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return (data ?? []) as CustomBase[];
  }
  async getBase(id: string): Promise<CustomBase | null> {
    const { data, error } = await this.client
      .from('bases')
      .select('id, name, tone, columns')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return (data as CustomBase) ?? null;
  }
  async createBase(def: NewBase): Promise<CustomBase> {
    const existing = await this.listBases();
    const id = slugId(def.name, new Set(existing.map((b) => b.id)));
    const row = {
      id,
      name: def.name,
      tone: def.tone ?? TONES[existing.length % TONES.length],
      columns: def.columns,
    };
    const { error } = await this.client.from('bases').insert(row);
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return row as CustomBase;
  }
  async listRecords(baseId: string): Promise<CatalogRecord[]> {
    const { data, error } = await this.client
      .from('base_records')
      .select('id, data')
      .eq('base_id', baseId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    return (data ?? []).map((r) => {
      const row = r as { id: string; data: Record<string, unknown> };
      return { id: row.id, ...row.data } as CatalogRecord;
    });
  }
  async addRecord(baseId: string, data: Record<string, unknown>): Promise<CatalogRecord> {
    const { data: inserted, error } = await this.client
      .from('base_records')
      .insert({ base_id: baseId, data })
      .select('id, data')
      .single();
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    const row = inserted as { id: string; data: Record<string, unknown> };
    return { id: row.id, ...row.data } as CatalogRecord;
  }
  async addRecords(baseId: string, rows: Record<string, unknown>[]): Promise<number> {
    if (!rows.length) return 0;
    const payload = rows.map((data) => ({ base_id: baseId, data }));
    const { error } = await this.client.from('base_records').insert(payload);
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    return rows.length;
  }
  async updateRecord(baseId: string, id: string, patch: Record<string, unknown>): Promise<CatalogRecord | null> {
    const { data: cur, error: readErr } = await this.client
      .from('base_records')
      .select('data')
      .eq('id', id)
      .eq('base_id', baseId)
      .maybeSingle();
    if (readErr) throw new Error(`Supabase (base_records): ${readErr.message}`);
    if (!cur) return null;
    const merged = { ...((cur as { data: Record<string, unknown> }).data ?? {}), ...patch };
    const { error } = await this.client.from('base_records').update({ data: merged }).eq('id', id);
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    return { id, ...merged } as CatalogRecord;
  }
}

// один экземпляр на процесс. Держим его на globalThis: в dev каждый роут
// собирается в свой бандл со своим модульным состоянием, поэтому обычная
// модульная переменная не шарится между /api/bases и /api/records — и
// in-memory база «пропадает». globalThis общий на процесс и это чинит.
const g = globalThis as typeof globalThis & { __customStore?: CustomStore };

export function getCustomStore(): CustomStore {
  if (g.__customStore) return g.__customStore;
  if (process.env.DATA_SOURCE === 'supabase') {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('DATA_SOURCE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_KEY');
    g.__customStore = new SupabaseCustomStore(url, key);
  } else {
    g.__customStore = new MemoryCustomStore();
  }
  return g.__customStore;
}
