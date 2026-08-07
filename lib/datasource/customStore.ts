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
  /** родитель в дереве баз (id базы) или null для верхнего уровня */
  parent: string | null;
  /** кто завёл базу; null — общая база, видна всем */
  owner: string | null;
}

export interface NewBase {
  name: string;
  tone?: CustomBase['tone'];
  columns: ColumnDef[];
  parent?: string | null;
  owner?: string | null;
}

export type NewColumn = { label: string; type?: ColumnDef['type']; filterable?: boolean };
export type ColumnPatch = { label?: string; type?: ColumnDef['type']; filterable?: boolean };
export interface BinRecord { baseId: string; baseName: string; record: CatalogRecord }
export interface BinContents { bases: CustomBase[]; records: BinRecord[] }

export interface CustomStore {
  listBases(): Promise<CustomBase[]>;
  getBase(id: string): Promise<CustomBase | null>;
  createBase(def: NewBase): Promise<CustomBase>;
  listRecords(baseId: string): Promise<CatalogRecord[]>;
  addRecord(baseId: string, data: Record<string, unknown>): Promise<CatalogRecord>;
  addRecords(baseId: string, rows: Record<string, unknown>[]): Promise<number>;
  updateRecord(baseId: string, id: string, patch: Record<string, unknown>): Promise<CatalogRecord | null>;
  renameBase(id: string, name: string): Promise<CustomBase | null>;
  moveBase(id: string, parent: string | null): Promise<CustomBase | null>;
  softDeleteBase(id: string): Promise<boolean>;
  restoreBase(id: string): Promise<boolean>;
  softDeleteRecords(baseId: string, ids: string[]): Promise<number>;
  restoreRecords(baseId: string, ids: string[]): Promise<number>;
  listBin(): Promise<BinContents>;
  emptyBin(scope?: { baseId?: string }): Promise<{ bases: number; records: number }>;
  addColumn(baseId: string, col: NewColumn): Promise<CustomBase | null>;
  updateColumn(baseId: string, key: string, patch: ColumnPatch): Promise<CustomBase | null>;
  deleteColumn(baseId: string, key: string): Promise<CustomBase | null>;
}

// новую колонку: label→key (стабильный), type по умолчанию text, filterable
// не для url/long-text (как в create_base)
export function normalizeNewColumn(col: NewColumn, existing: ColumnDef[]): ColumnDef {
  const label = String(col.label ?? '').trim();
  let key = label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/(^_|_$)/g, '') || `col${existing.length}`;
  const used = new Set(existing.map((c) => c.key));
  while (used.has(key)) key = `${key}_`;
  const type: ColumnDef['type'] = (['number', 'url', 'long-text', 'select'] as const).includes(col.type as never) ? col.type! : 'text';
  return { key, label, type, sortable: true, filterable: Boolean(col.filterable) && type !== 'long-text' && type !== 'url' };
}
// патч колонки: key НЕИЗМЕНЕН; label/type/filterable опционально; filterable
// пересчитывается под новый тип
export function applyColumnPatch(col: ColumnDef, patch: ColumnPatch): ColumnDef {
  const type = patch.type ?? col.type;
  const label = patch.label !== undefined ? String(patch.label).trim() || col.label : col.label;
  const filterable = (patch.filterable ?? col.filterable ?? false) && type !== 'long-text' && type !== 'url';
  return { ...col, label, type, filterable };
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
export class MemoryCustomStore implements CustomStore {
  private bases: CustomBase[] = [];
  private rows: Record<string, CatalogRecord[]> = {};
  private seq = 0;
  private deletedBases = new Set<string>();
  private deletedRows: Record<string, Set<string>> = {};

  async listBases() {
    return this.bases.filter((b) => !this.deletedBases.has(b.id));
  }
  async getBase(id: string) {
    if (this.deletedBases.has(id)) return null;
    return this.bases.find((b) => b.id === id) ?? null;
  }
  async createBase(def: NewBase) {
    const id = slugId(def.name, new Set(this.bases.map((b) => b.id)));
    const base: CustomBase = {
      id,
      name: def.name,
      tone: def.tone ?? TONES[this.bases.length % TONES.length],
      columns: def.columns,
      parent: def.parent ?? null,
      owner: def.owner ?? null,
    };
    this.bases.push(base);
    this.rows[id] = [];
    return base;
  }
  async listRecords(baseId: string) {
    const gone = this.deletedRows[baseId] ?? new Set<string>();
    return (this.rows[baseId] ?? []).filter((r) => !gone.has(r.id));
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

  async softDeleteBase(id: string) {
    if (!this.bases.some((b) => b.id === id)) return false;
    this.deletedBases.add(id);
    return true;
  }
  async softDeleteRecords(baseId: string, ids: string[]) {
    const set = (this.deletedRows[baseId] ??= new Set());
    let n = 0;
    for (const id of ids) if ((this.rows[baseId] ?? []).some((r) => r.id === id) && !set.has(id)) { set.add(id); n++; }
    return n;
  }
  async restoreBase(id: string) { const had = this.deletedBases.delete(id); return had; }
  async restoreRecords(baseId: string, ids: string[]) {
    const set = this.deletedRows[baseId]; if (!set) return 0;
    let n = 0; for (const id of ids) if (set.delete(id)) n++; return n;
  }
  async listBin(): Promise<BinContents> {
    const bases = this.bases.filter((b) => this.deletedBases.has(b.id));
    const records: BinRecord[] = [];
    for (const [baseId, set] of Object.entries(this.deletedRows)) {
      const base = this.bases.find((b) => b.id === baseId);
      for (const r of this.rows[baseId] ?? []) if (set.has(r.id)) records.push({ baseId, baseName: base?.name ?? baseId, record: r });
    }
    return { bases, records };
  }
  async emptyBin(scope?: { baseId?: string }) {
    let bases = 0, records = 0;
    const baseIds = scope?.baseId ? [scope.baseId] : [...this.deletedBases];
    for (const id of baseIds) if (this.deletedBases.delete(id)) { this.bases = this.bases.filter((b) => b.id !== id); delete this.rows[id]; delete this.deletedRows[id]; bases++; }
    for (const [baseId, set] of Object.entries(this.deletedRows)) {
      if (scope?.baseId && scope.baseId !== baseId) continue;
      const rows = this.rows[baseId] ?? [];
      this.rows[baseId] = rows.filter((r) => !set.has(r.id));
      records += set.size; set.clear();
    }
    return { bases, records };
  }
  async renameBase(id: string, name: string) { const b = this.bases.find((x) => x.id === id); if (!b || this.deletedBases.has(id)) return null; b.name = name; return b; }
  async moveBase(id: string, parent: string | null) { const b = this.bases.find((x) => x.id === id); if (!b || this.deletedBases.has(id)) return null; b.parent = parent; return b; }
  async addColumn(baseId: string, col: NewColumn) { return this.mutateColumns(baseId, (cols) => [...cols, normalizeNewColumn(col, cols)]); }
  async updateColumn(baseId: string, key: string, patch: ColumnPatch) {
    return this.mutateColumns(baseId, (cols) => cols.map((c) => c.key === key ? applyColumnPatch(c, patch) : c));
  }
  async deleteColumn(baseId: string, key: string) { return this.mutateColumns(baseId, (cols) => cols.filter((c) => c.key !== key)); }
  private async mutateColumns(baseId: string, fn: (cols: ColumnDef[]) => ColumnDef[]) {
    const b = this.bases.find((x) => x.id === baseId); if (!b || this.deletedBases.has(baseId)) return null;
    b.columns = fn(b.columns); return b;
  }
}

// ── Supabase (prod) ─────────────────────────────────────────────
class SupabaseCustomStore implements CustomStore {
  private readonly client;
  constructor(url: string, key: string) {
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }
  // select('*') терпимо к отсутствию колонки parent (до миграции) —
  // читаем parent опционально
  private norm(row: Record<string, unknown>): CustomBase {
    return {
      id: String(row.id),
      name: String(row.name),
      tone: (row.tone as CustomBase['tone']) ?? 'sage',
      columns: (row.columns as ColumnDef[]) ?? [],
      parent: (row.parent as string) ?? null,
      owner: (row.owner_email as string) ?? null,
    };
  }
  async listBases(): Promise<CustomBase[]> {
    const { data, error } = await this.client
      .from('bases')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return (data ?? []).map((r) => this.norm(r as Record<string, unknown>));
  }
  async getBase(id: string): Promise<CustomBase | null> {
    const { data, error } = await this.client
      .from('bases')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return data ? this.norm(data as Record<string, unknown>) : null;
  }
  async createBase(def: NewBase): Promise<CustomBase> {
    const existing = await this.listBases();
    const id = slugId(def.name, new Set(existing.map((b) => b.id)));
    const tone = def.tone ?? TONES[existing.length % TONES.length];
    // parent включаем в insert только если задан — так создание базы на
    // верхнем уровне работает даже до миграции колонки parent
    const row: Record<string, unknown> = { id, name: def.name, tone, columns: def.columns };
    if (def.parent) row.parent = def.parent;
    if (def.owner) row.owner_email = def.owner;
    let { error } = await this.client.from('bases').insert(row);
    // колонки owner_email может ещё не быть (миграция не накатана) — тогда
    // заводим базу как общую, вместо того чтобы падать
    if (error && /owner_email/.test(error.message)) {
      delete row.owner_email;
      ({ error } = await this.client.from('bases').insert(row));
    }
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return { id, name: def.name, tone, columns: def.columns, parent: def.parent ?? null, owner: def.owner ?? null };
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
