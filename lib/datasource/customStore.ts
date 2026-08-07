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
  /** ручной порядок строк: перечисленные id встают в заданном порядке.
      Возвращает число переставленных строк. */
  reorderRecords(baseId: string, orderedIds: string[]): Promise<number>;
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
  reorderColumns(baseId: string, keys: string[]): Promise<CustomBase | null>;
}

// Порядок колонок по списку ключей: перечисленные встают в заданном порядке,
// не упомянутые (на случай рассинхрона) сохраняются в конце в прежнем порядке.
export function reorderByKeys(cols: ColumnDef[], keys: string[]): ColumnDef[] {
  const byKey = new Map(cols.map((c) => [c.key, c]));
  const out: ColumnDef[] = [];
  for (const k of keys) {
    const c = byKey.get(k);
    if (c) { out.push(c); byKey.delete(k); }
  }
  for (const c of cols) if (byKey.has(c.key)) out.push(c);
  return out;
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
  async reorderRecords(baseId: string, orderedIds: string[]) {
    const bucket = this.rows[baseId];
    if (!bucket || !orderedIds.length) return 0;
    // порядок массива и есть порядок выдачи (listRecords отдаёт как лежит):
    // переставляем по рангу из списка, неупомянутые оседают в конце
    const rank = new Map(orderedIds.map((id, i) => [id, i]));
    bucket.sort((a, b) => (rank.get(String(a.id)) ?? 1e9) - (rank.get(String(b.id)) ?? 1e9));
    return orderedIds.filter((id) => bucket.some((r) => String(r.id) === id)).length;
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
  async reorderColumns(baseId: string, keys: string[]) { return this.mutateColumns(baseId, (cols) => reorderByKeys(cols, keys)); }
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
  private async listBasesFiltered(): Promise<CustomBase[]> {
    let q = this.client.from('bases').select('*').order('created_at', { ascending: true });
    let { data, error } = await q.is('deleted_at', null);
    if (error && /deleted_at/.test(error.message)) {
      ({ data, error } = await this.client.from('bases').select('*').order('created_at', { ascending: true }));
    }
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return (data ?? []).map((r) => this.norm(r as Record<string, unknown>));
  }
  async listBases(): Promise<CustomBase[]> {
    return this.listBasesFiltered();
  }
  async getBase(id: string): Promise<CustomBase | null> {
    let { data, error } = await this.client
      .from('bases')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error && /deleted_at/.test(error.message)) {
      ({ data, error } = await this.client.from('bases').select('*').eq('id', id).maybeSingle());
    }
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return data ? this.norm(data as Record<string, unknown>) : null;
  }
  async softDeleteBase(id: string): Promise<boolean> {
    const { error, count } = await this.client
      .from('bases')
      .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
      .eq('id', id);
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return (count ?? 0) > 0;
  }
  async restoreBase(id: string): Promise<boolean> {
    const { error, count } = await this.client
      .from('bases')
      .update({ deleted_at: null }, { count: 'exact' })
      .eq('id', id);
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return (count ?? 0) > 0;
  }
  async renameBase(id: string, name: string): Promise<CustomBase | null> {
    let { data, error } = await this.client.from('bases').update({ name }).eq('id', id).is('deleted_at', null).select('*').maybeSingle();
    if (error && /deleted_at/.test(error.message)) {
      ({ data, error } = await this.client.from('bases').update({ name }).eq('id', id).select('*').maybeSingle());
    }
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return data ? this.norm(data as Record<string, unknown>) : null;
  }
  async moveBase(id: string, parent: string | null): Promise<CustomBase | null> {
    let { data, error } = await this.client.from('bases').update({ parent }).eq('id', id).is('deleted_at', null).select('*').maybeSingle();
    if (error && /deleted_at/.test(error.message)) {
      ({ data, error } = await this.client.from('bases').update({ parent }).eq('id', id).select('*').maybeSingle());
    }
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
    let q = this.client.from('base_records').select('id, data').eq('base_id', baseId).is('deleted_at', null);
    let { data, error } = await q.order('created_at', { ascending: true });
    if (error && /deleted_at/.test(error.message)) {
      ({ data, error } = await this.client
        .from('base_records')
        .select('id, data')
        .eq('base_id', baseId)
        .order('created_at', { ascending: true }));
    }
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    // ручной порядок хранится в data.__pos (число). Схема без миграций —
    // поэтому позиция живёт в том же jsonb, а не в отдельной колонке. Строки
    // без __pos (ещё не переставляли) уходят в конец, сохраняя порядок по
    // created_at: сортировка стабильная, а выборка уже упорядочена по нему.
    const rows = (data ?? []).map((r) => r as { id: string; data: Record<string, unknown> });
    const posOf = (d: Record<string, unknown>) =>
      typeof d.__pos === 'number' ? (d.__pos as number) : Number.MAX_SAFE_INTEGER;
    rows.sort((a, b) => posOf(a.data) - posOf(b.data));
    return rows.map(({ id, data: d }) => {
      // __pos — служебное поле, наружу его не отдаём
      const { __pos: _pos, ...rest } = d;
      return { id, ...rest } as CatalogRecord;
    });
  }
  async reorderRecords(baseId: string, orderedIds: string[]): Promise<number> {
    if (!orderedIds.length) return 0;
    // читаем текущие строки (id + data), чтобы вписать __pos, не затерев поля
    let { data, error } = await this.client
      .from('base_records').select('id, data').eq('base_id', baseId).is('deleted_at', null);
    if (error && /deleted_at/.test(error.message)) {
      ({ data, error } = await this.client.from('base_records').select('id, data').eq('base_id', baseId));
    }
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    const rank = new Map(orderedIds.map((id, i) => [id, i]));
    const payload: { id: string; base_id: string; data: Record<string, unknown> }[] = [];
    for (const r of data ?? []) {
      const row = r as { id: string; data: Record<string, unknown> };
      const p = rank.get(String(row.id));
      if (p === undefined) continue; // id не из этого списка — не трогаем
      payload.push({ id: row.id, base_id: baseId, data: { ...(row.data ?? {}), __pos: p } });
    }
    if (!payload.length) return 0;
    // один upsert по id — переставляем всю базу за один запрос (базы небольшие)
    const { error: upErr } = await this.client.from('base_records').upsert(payload, { onConflict: 'id' });
    if (upErr) throw new Error(`Supabase (base_records): ${upErr.message}`);
    return payload.length;
  }
  async softDeleteRecords(baseId: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const { error, count } = await this.client
      .from('base_records')
      .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
      .eq('base_id', baseId).in('id', ids);
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    return count ?? ids.length;
  }
  async restoreRecords(baseId: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const { error, count } = await this.client
      .from('base_records')
      .update({ deleted_at: null }, { count: 'exact' })
      .eq('base_id', baseId).in('id', ids);
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    return count ?? ids.length;
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
  async listBin(): Promise<BinContents> {
    const { data: bd, error: be } = await this.client.from('bases').select('*').not('deleted_at', 'is', null);
    if (be) throw new Error(`Supabase (bases): ${be.message}`);
    const bases = (bd ?? []).map((r) => this.norm(r as Record<string, unknown>));
    // имена всех баз (в т.ч. живых) — для подписи строк в корзине
    const { data: allBases } = await this.client.from('bases').select('id, name');
    const nameById = new Map((allBases ?? []).map((b) => [String((b as { id: string }).id), String((b as { name: string }).name)]));
    const { data: rd, error: re } = await this.client.from('base_records').select('id, base_id, data').not('deleted_at', 'is', null);
    if (re) throw new Error(`Supabase (base_records): ${re.message}`);
    const records: BinRecord[] = (rd ?? []).map((r) => {
      const row = r as { id: string; base_id: string; data: Record<string, unknown> };
      return { baseId: row.base_id, baseName: nameById.get(row.base_id) ?? row.base_id, record: { id: row.id, ...row.data } as CatalogRecord };
    });
    return { bases, records };
  }
  async emptyBin(scope?: { baseId?: string }): Promise<{ bases: number; records: number }> {
    // строки: удаляем помеченные (по base_id, если задан scope)
    let recDel = this.client.from('base_records').delete({ count: 'exact' }).not('deleted_at', 'is', null);
    if (scope?.baseId) recDel = recDel.eq('base_id', scope.baseId);
    const { count: recCount, error: re } = await recDel;
    if (re) throw new Error(`Supabase (base_records): ${re.message}`);
    // базы: удаляем помеченные; сначала их строки целиком (FK), затем сами базы
    let bases = 0;
    let binnedBaseQ = this.client.from('bases').select('id').not('deleted_at', 'is', null);
    if (scope?.baseId) binnedBaseQ = binnedBaseQ.eq('id', scope.baseId);
    const { data: binnedBases, error: bqe } = await binnedBaseQ;
    if (bqe) throw new Error(`Supabase (bases): ${bqe.message}`);
    for (const b of binnedBases ?? []) {
      const id = String((b as { id: string }).id);
      const { error: ce } = await this.client.from('base_records').delete().eq('base_id', id); // включая живые строки удаляемой базы
      if (ce) throw new Error(`Supabase (base_records): ${ce.message}`);
      const { error: de } = await this.client.from('bases').delete().eq('id', id);
      if (de) throw new Error(`Supabase (bases): ${de.message}`);
      bases++;
    }
    return { bases, records: recCount ?? 0 };
  }
  private async writeColumns(baseId: string, cols: ColumnDef[]): Promise<CustomBase | null> {
    let { data, error } = await this.client.from('bases').update({ columns: cols }).eq('id', baseId).is('deleted_at', null).select('*').maybeSingle();
    if (error && /deleted_at/.test(error.message)) {
      ({ data, error } = await this.client.from('bases').update({ columns: cols }).eq('id', baseId).select('*').maybeSingle());
    }
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return data ? this.norm(data as Record<string, unknown>) : null;
  }
  async addColumn(baseId: string, col: NewColumn): Promise<CustomBase | null> {
    const base = await this.getBase(baseId); if (!base) return null;
    return this.writeColumns(baseId, [...base.columns, normalizeNewColumn(col, base.columns)]);
  }
  async updateColumn(baseId: string, key: string, patch: ColumnPatch): Promise<CustomBase | null> {
    const base = await this.getBase(baseId); if (!base) return null;
    const before = base.columns.find((c) => c.key === key);
    const result = await this.writeColumns(baseId, base.columns.map((c) => c.key === key ? applyColumnPatch(c, patch) : c));
    // Смена типа на число — приводим уже записанные значения: разбираемые
    // строки становятся числами (чтобы сортировка и итоги работали), а те, что
    // числом не станут, остаются как есть. Данные не теряем — в отличие от
    // Airtable (text→attachment очищает); честность про потери держит UI,
    // предупреждая заранее, сколько значений не подойдёт.
    if (patch.type === 'number' && before && before.type !== 'number') {
      await this.coerceColumnToNumber(baseId, key);
    }
    return result;
  }
  // проходим строки базы и переписываем значение колонки в число, где выходит
  private async coerceColumnToNumber(baseId: string, key: string): Promise<void> {
    // как в listBases: пробуем с фильтром корзины, а если колонки deleted_at
    // ещё нет в базе (миграция не прогнана) — берём все строки
    let { data, error } = await this.client
      .from('base_records').select('id, data').eq('base_id', baseId).is('deleted_at', null);
    if (error && /deleted_at/.test(error.message)) {
      ({ data, error } = await this.client.from('base_records').select('id, data').eq('base_id', baseId));
    }
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    for (const r of data ?? []) {
      const row = r as { id: string; data: Record<string, unknown> };
      const v = row.data?.[key];
      if (v === undefined || v === null || typeof v === 'number') continue;
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || String(v).trim() === '') continue;
      const merged = { ...row.data, [key]: n };
      const { error: ue } = await this.client.from('base_records').update({ data: merged }).eq('id', row.id);
      if (ue) throw new Error(`Supabase (base_records): ${ue.message}`);
    }
  }
  async deleteColumn(baseId: string, key: string): Promise<CustomBase | null> {
    const base = await this.getBase(baseId); if (!base) return null;
    return this.writeColumns(baseId, base.columns.filter((c) => c.key !== key));
  }
  async reorderColumns(baseId: string, keys: string[]): Promise<CustomBase | null> {
    const base = await this.getBase(baseId); if (!base) return null;
    return this.writeColumns(baseId, reorderByKeys(base.columns, keys));
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
