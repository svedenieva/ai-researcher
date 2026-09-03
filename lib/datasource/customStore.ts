import { createClient } from '@supabase/supabase-js';
import type { ColumnDef, CatalogRecord } from './types';
import { MODE_KEY, MODE_RESEARCH, MODE_REFERENCE } from '../mode';
import { coerceToNumber } from '../coerce';

// User bases (goal #1): log in → create a base → define columns → fill with rows.
// Base definitions and their rows are stored separately from the product catalog.
// Two backends with the same interface:
//   - Supabase (prod): tables `bases` and `base_records`;
//   - in-memory (local dev): lives in the dev-server process.

export interface CustomBase {
  id: string;
  name: string;
  tone: 'sage' | 'teal' | 'blue' | 'amber';
  columns: ColumnDef[];
  /** parent in the base tree (base id) or null for the top level */
  parent: string | null;
  /** who created the base; null — an "ownerless" legacy/team base, visible to everyone */
  owner: string | null;
  /** explicitly marked shared — visible to everyone, even if it has an owner */
  shared: boolean;
  /** when the base was created (ISO). Optional: legacy rows written before the
      column was read back have none, and the showcase just omits the date. */
  createdAt?: string | null;
  /** ТР-БИ-03: стадия исследования темы. null — не задана (= не исследована). */
  state?: 'unexplored' | 'in_progress' | 'closed' | null;
  /** ТР-БИ-03: формулировка искомого (что ищем по этой теме). */
  query?: string | null;
}

export type BaseState = NonNullable<CustomBase['state']>;

export interface NewBase {
  name: string;
  tone?: CustomBase['tone'];
  columns: ColumnDef[];
  parent?: string | null;
  owner?: string | null;
  shared?: boolean;
}

// ── base access ────────────────────────────────────────────────────────────
// Private model: a person sees their own bases (owner===me), explicitly shared
// ones (shared), and "ownerless" legacy bases (owner===null) — the shared team
// knowledge base, common to everyone. New bases always get an owner, so
// owner===null = exactly the former team bases. This way isolation works WITHOUT
// a migration and with no risk of the team losing its knowledge base.
export function canAccessBase(
  base: { id?: string; owner: string | null; shared?: boolean },
  me: string | null,
  granted?: Set<string>,
): boolean {
  if (base.owner === null || base.shared === true) return true;
  if (me !== null && base.owner === me) return true;
  // ТР-БД-03: пользователь, которому владелец выдал доступ к этой базе
  if (me !== null && base.id && granted?.has(base.id)) return true;
  return false;
}

// ТР-БД-03: доступ с учётом пер-юзер выдачи (делает запрос к base_access при
// необходимости). Для маршрутов, где важно пустить приглашённого пользователя.
export async function userCanAccess(
  store: CustomStore,
  base: { id?: string; owner: string | null; shared?: boolean },
  me: string | null,
): Promise<boolean> {
  if (canAccessBase(base, me)) return true;
  if (me && base.id) return (await store.basesGrantedTo(me)).has(base.id);
  return false;
}

export type NewColumn = { label: string; type?: ColumnDef['type']; filterable?: boolean };
export type ColumnPatch = { label?: string; type?: ColumnDef['type']; filterable?: boolean; numberFormat?: ColumnDef['numberFormat'] };
export interface BinRecord { baseId: string; baseName: string; record: CatalogRecord }
export interface BinContents { bases: CustomBase[]; records: BinRecord[] }

export interface CustomStore {
  /** bases available to user me (own + shared + ownerless). */
  listBases(me: string | null): Promise<CustomBase[]>;
  /** ALL bases with no access filter — only for internal needs (id uniqueness,
      tree traversal). Do not expose directly to the UI/MCP. */
  listAllBases(): Promise<CustomBase[]>;
  getBase(id: string): Promise<CustomBase | null>;
  createBase(def: NewBase): Promise<CustomBase>;
  listRecords(baseId: string): Promise<CatalogRecord[]>;
  addRecord(baseId: string, data: Record<string, unknown>): Promise<CatalogRecord>;
  addRecords(baseId: string, rows: Record<string, unknown>[]): Promise<number>;
  updateRecord(baseId: string, id: string, patch: Record<string, unknown>): Promise<CatalogRecord | null>;
  /** manual row order: the listed ids take the given order.
      Returns the number of rows repositioned. */
  reorderRecords(baseId: string, orderedIds: string[]): Promise<number>;
  renameBase(id: string, name: string): Promise<CustomBase | null>;
  moveBase(id: string, parent: string | null): Promise<CustomBase | null>;
  /** ТР-БИ-03: задать состояние/формулировку темы (толерантно к отсутствию колонок) */
  setBaseMeta(id: string, patch: { state?: CustomBase['state']; query?: string | null }): Promise<CustomBase | null>;
  /** ТР-БД-03: пер-юзер доступ к базе. Толерантны к отсутствию таблицы base_access. */
  listAccess(baseId: string): Promise<string[]>;
  grantAccess(baseId: string, email: string): Promise<void>;
  revokeAccess(baseId: string, email: string): Promise<void>;
  /** baseId, к которым у me есть явная выдача доступа */
  basesGrantedTo(me: string): Promise<Set<string>>;
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

// Column order by a list of keys: the listed ones take the given order,
// unmentioned ones (in case of desync) are kept at the end in their prior order.
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

// build a new column: label→key (stable), type defaults to text, filterable
// not for url/long-text (as in create_base)
export function normalizeNewColumn(col: NewColumn, existing: ColumnDef[]): ColumnDef {
  const label = String(col.label ?? '').trim();
  let key = label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/(^_|_$)/g, '') || `col${existing.length}`;
  const used = new Set(existing.map((c) => c.key));
  while (used.has(key) || RESERVED_COLUMN_KEYS.has(key)) key = `${key}_`;
  const type: ColumnDef['type'] = (['number', 'url', 'long-text', 'select'] as const).includes(col.type as never) ? col.type! : 'text';
  return { key, label, type, sortable: true, filterable: Boolean(col.filterable) && type !== 'long-text' && type !== 'url' };
}
// Fields the server owns. They must never arrive from the caller.
//   id       — the row's identity. It used to be overridable because the object
//              was built as { id, ...data }: a caller-supplied data.id won, two
//              rows could share an id, and every later update/delete/restore
//              addressed the wrong one.
//   __pos    — manual sort position, written only by reorderRecords.
//   __source — the originating base name, computed on read for nested views.
// __mode is deliberately NOT here: it is the user-facing "Режим" column and a
// person toggles it in the grid. It is validated instead — see below.
const SERVER_OWNED = new Set(['id', '__pos', '__source']);

// Column keys that would collide with a record's own fields. "ID" is a column
// label in half the CRM exports out there, and its derived key is exactly `id`.
export const RESERVED_COLUMN_KEYS = new Set(['id', '__mode', '__tags', '__pos', '__source']);

export function sanitizeRecordData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (SERVER_OWNED.has(k)) continue;
    // an unknown mode would sit in storage as garbage; recordMode() masks it on
    // read, so the bug would stay invisible until an export or a raw query
    if (k === MODE_KEY && v !== MODE_RESEARCH && v !== MODE_REFERENCE) continue;
    out[k] = v;
  }
  return out;
}

// column patch: key UNCHANGED; label/type/filterable optional; filterable
// recomputed for the new type
export function applyColumnPatch(col: ColumnDef, patch: ColumnPatch): ColumnDef {
  const type = patch.type ?? col.type;
  const label = patch.label !== undefined ? String(patch.label).trim() || col.label : col.label;
  const filterable = (patch.filterable ?? col.filterable ?? false) && type !== 'long-text' && type !== 'url';
  // формат чисел живёт только у числовых колонок; при смене типа — сбрасываем.
  // «Обычное» без знаков/валюты не храним — это состояние по умолчанию.
  let numberFormat = patch.numberFormat !== undefined ? patch.numberFormat : col.numberFormat;
  if (type !== 'number') numberFormat = undefined;
  else if (numberFormat && (numberFormat.style ?? 'plain') === 'plain' && !numberFormat.decimals && !numberFormat.currency) {
    numberFormat = undefined;
  }
  return { ...col, label, type, filterable, numberFormat };
}

const TONES: CustomBase['tone'][] = ['teal', 'blue', 'amber', 'sage'];

// url-safe slug from the name + a short suffix (uniqueness)
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
  private access: Record<string, Set<string>> = {}; // baseId → emails (ТР-БД-03)

  async listAllBases() {
    return this.bases.filter((b) => !this.deletedBases.has(b.id));
  }
  async listBases(me: string | null) {
    const granted = me ? await this.basesGrantedTo(me) : undefined;
    return (await this.listAllBases()).filter((b) => canAccessBase(b, me, granted));
  }
  async listAccess(baseId: string) { return [...(this.access[baseId] ?? [])]; }
  async grantAccess(baseId: string, email: string) { (this.access[baseId] ??= new Set()).add(email); }
  async revokeAccess(baseId: string, email: string) { this.access[baseId]?.delete(email); }
  async basesGrantedTo(me: string) {
    const out = new Set<string>();
    for (const [baseId, emails] of Object.entries(this.access)) if (emails.has(me)) out.add(baseId);
    return out;
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
      shared: def.shared ?? false,
      createdAt: new Date().toISOString(),
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
    const record = { id: `r${++this.seq}`, [MODE_KEY]: MODE_RESEARCH, ...sanitizeRecordData(data) } as CatalogRecord;
    (this.rows[baseId] ??= []).push(record);
    return record;
  }
  async addRecords(baseId: string, rows: Record<string, unknown>[]) {
    const bucket = (this.rows[baseId] ??= []);
    for (const data of rows) bucket.push({ id: `r${++this.seq}`, [MODE_KEY]: MODE_RESEARCH, ...sanitizeRecordData(data) } as CatalogRecord);
    return rows.length;
  }
  async updateRecord(baseId: string, id: string, patch: Record<string, unknown>) {
    const row = (this.rows[baseId] ?? []).find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, sanitizeRecordData(patch));
    return row;
  }
  async reorderRecords(baseId: string, orderedIds: string[]) {
    const bucket = this.rows[baseId];
    if (!bucket || !orderedIds.length) return 0;
    // the array order is the output order (listRecords returns them as they lie):
    // reorder by rank from the list, unmentioned ones settle at the end
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
  async setBaseMeta(id: string, patch: { state?: CustomBase['state']; query?: string | null }) {
    const b = this.bases.find((x) => x.id === id);
    if (!b || this.deletedBases.has(id)) return null;
    if (patch.state !== undefined) b.state = patch.state;
    if (patch.query !== undefined) b.query = patch.query;
    return b;
  }
  async addColumn(baseId: string, col: NewColumn) { return this.mutateColumns(baseId, (cols) => [...cols, normalizeNewColumn(col, cols)]); }
  async updateColumn(baseId: string, key: string, patch: ColumnPatch) {
    const b = this.bases.find((x) => x.id === baseId);
    if (!b || this.deletedBases.has(baseId)) return null;
    const before = b.columns.find((c) => c.key === key);
    b.columns = b.columns.map((c) => c.key === key ? applyColumnPatch(c, patch) : c);
    // switching to number coerces the stored values — parity with the Supabase
    // store, so dev/tests behave like prod (honest: unparseable values are kept)
    if (patch.type === 'number' && before && before.type !== 'number') {
      for (const r of this.rows[baseId] ?? []) {
        if (key in r) (r as Record<string, unknown>)[key] = coerceToNumber(r[key]);
      }
    }
    return b;
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
  // select('*') tolerates a missing parent column (before the migration) —
  // we read parent optionally
  private norm(row: Record<string, unknown>): CustomBase {
    return {
      id: String(row.id),
      name: String(row.name),
      tone: (row.tone as CustomBase['tone']) ?? 'sage',
      columns: (row.columns as ColumnDef[]) ?? [],
      parent: (row.parent as string) ?? null,
      owner: (row.owner_email as string) ?? null,
      // the shared column may not exist yet in the live DB — then undefined→false.
      // Isolation still works: owner===null (legacy/team) are visible to everyone.
      shared: Boolean(row.shared),
      createdAt: (row.created_at as string) ?? null,
      // state/query — до миграции 0004 колонок нет → undefined
      state: (row.state as CustomBase['state']) ?? null,
      query: (row.query as string) ?? null,
    };
  }
  async listAllBases(): Promise<CustomBase[]> {
    let q = this.client.from('bases').select('*').order('created_at', { ascending: true });
    let { data, error } = await q.is('deleted_at', null);
    if (error && /deleted_at/.test(error.message)) {
      ({ data, error } = await this.client.from('bases').select('*').order('created_at', { ascending: true }));
    }
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return (data ?? []).map((r) => this.norm(r as Record<string, unknown>));
  }
  async listBases(me: string | null): Promise<CustomBase[]> {
    const granted = me ? await this.basesGrantedTo(me) : undefined;
    return (await this.listAllBases()).filter((b) => canAccessBase(b, me, granted));
  }
  // ТР-БД-03: доступы. Толерантны к отсутствию таблицы base_access (до миграции 0005).
  async listAccess(baseId: string): Promise<string[]> {
    const { data, error } = await this.client.from('base_access').select('email').eq('base_id', baseId);
    if (error) return [];
    return (data ?? []).map((r) => String((r as { email: string }).email));
  }
  async grantAccess(baseId: string, email: string): Promise<void> {
    const { error } = await this.client.from('base_access').upsert({ base_id: baseId, email }, { onConflict: 'base_id,email' });
    if (error && !/base_access/.test(error.message)) throw new Error(`Supabase (base_access): ${error.message}`);
  }
  async revokeAccess(baseId: string, email: string): Promise<void> {
    const { error } = await this.client.from('base_access').delete().eq('base_id', baseId).eq('email', email);
    if (error && !/base_access/.test(error.message)) throw new Error(`Supabase (base_access): ${error.message}`);
  }
  async basesGrantedTo(me: string): Promise<Set<string>> {
    const { data, error } = await this.client.from('base_access').select('base_id').eq('email', me);
    if (error) return new Set();
    return new Set((data ?? []).map((r) => String((r as { base_id: string }).base_id)));
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
  async setBaseMeta(id: string, patch: { state?: CustomBase['state']; query?: string | null }): Promise<CustomBase | null> {
    const upd: Record<string, unknown> = {};
    if (patch.state !== undefined) upd.state = patch.state;
    if (patch.query !== undefined) upd.query = patch.query;
    if (!Object.keys(upd).length) return this.getBase(id);
    let { data, error } = await this.client.from('bases').update(upd).eq('id', id).is('deleted_at', null).select('*').maybeSingle();
    if (error && /deleted_at/.test(error.message)) {
      ({ data, error } = await this.client.from('bases').update(upd).eq('id', id).select('*').maybeSingle());
    }
    // до миграции 0004 колонок state/query нет — деградируем мягко, не падая
    if (error && /column .*(state|query)|(state|query).* does not exist/i.test(error.message)) {
      return this.getBase(id);
    }
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return data ? this.norm(data as Record<string, unknown>) : null;
  }
  async createBase(def: NewBase): Promise<CustomBase> {
    // id uniqueness — across ALL bases, not just the accessible ones: ids are
    // global, two people must not get the same slug
    const existing = await this.listAllBases();
    const id = slugId(def.name, new Set(existing.map((b) => b.id)));
    const tone = def.tone ?? TONES[existing.length % TONES.length];
    // include parent in the insert only if set — so creating a base at the top
    // level works even before the parent-column migration
    const row: Record<string, unknown> = { id, name: def.name, tone, columns: def.columns };
    if (def.parent) row.parent = def.parent;
    if (def.owner) row.owner_email = def.owner;
    if (def.shared) row.shared = true;
    let { error } = await this.client.from('bases').insert(row);
    // the owner_email / shared columns may not exist yet (migration not applied) —
    // then we drop them and create the base without them instead of failing
    if (error && /owner_email|shared/.test(error.message)) {
      delete row.owner_email;
      delete row.shared;
      ({ error } = await this.client.from('bases').insert(row));
    }
    if (error) throw new Error(`Supabase (bases): ${error.message}`);
    return { id, name: def.name, tone, columns: def.columns, parent: def.parent ?? null, owner: def.owner ?? null, shared: def.shared ?? false, createdAt: new Date().toISOString() };
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
    // the manual order is stored in data.__pos (a number). The schema is
    // migration-free — so the position lives in the same jsonb, not a separate
    // column. Rows without __pos (never reordered) go to the end, keeping their
    // created_at order: the sort is stable, and the query is already ordered by it.
    const rows = (data ?? []).map((r) => r as { id: string; data: Record<string, unknown> });
    const posOf = (d: Record<string, unknown>) =>
      typeof d.__pos === 'number' ? (d.__pos as number) : Number.MAX_SAFE_INTEGER;
    rows.sort((a, b) => posOf(a.data) - posOf(b.data));
    return rows.map(({ id, data: d }) => {
      // __pos is an internal field, we don't expose it outward
      const { __pos: _pos, ...rest } = d;
      return { id, ...rest } as CatalogRecord;
    });
  }
  async reorderRecords(baseId: string, orderedIds: string[]): Promise<number> {
    if (!orderedIds.length) return 0;
    // read the current rows (id + data) so we can write __pos without wiping fields
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
      if (p === undefined) continue; // id not from this list — leave it alone
      payload.push({ id: row.id, base_id: baseId, data: { ...(row.data ?? {}), __pos: p } });
    }
    if (!payload.length) return 0;
    // one upsert by id — reorder the whole base in a single request (bases are small)
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
      .insert({ base_id: baseId, data: { [MODE_KEY]: MODE_RESEARCH, ...sanitizeRecordData(data) } })
      .select('id, data')
      .single();
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    const row = inserted as { id: string; data: Record<string, unknown> };
    return { id: row.id, ...row.data } as CatalogRecord;
  }
  async addRecords(baseId: string, rows: Record<string, unknown>[]): Promise<number> {
    if (!rows.length) return 0;
    const payload = rows.map((data) => ({ base_id: baseId, data: { [MODE_KEY]: MODE_RESEARCH, ...sanitizeRecordData(data) } }));
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
    const merged = { ...((cur as { data: Record<string, unknown> }).data ?? {}), ...sanitizeRecordData(patch) };
    const { error } = await this.client.from('base_records').update({ data: merged }).eq('id', id);
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    return { id, ...merged } as CatalogRecord;
  }
  async listBin(): Promise<BinContents> {
    const { data: bd, error: be } = await this.client.from('bases').select('*').not('deleted_at', 'is', null);
    if (be) throw new Error(`Supabase (bases): ${be.message}`);
    const bases = (bd ?? []).map((r) => this.norm(r as Record<string, unknown>));
    // names of all bases (including live ones) — for labeling rows in the bin
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
    // rows: delete the flagged ones (by base_id if a scope is set)
    let recDel = this.client.from('base_records').delete({ count: 'exact' }).not('deleted_at', 'is', null);
    if (scope?.baseId) recDel = recDel.eq('base_id', scope.baseId);
    const { count: recCount, error: re } = await recDel;
    if (re) throw new Error(`Supabase (base_records): ${re.message}`);
    // bases: delete the flagged ones; first their rows entirely (FK), then the bases themselves
    let bases = 0;
    let binnedBaseQ = this.client.from('bases').select('id').not('deleted_at', 'is', null);
    if (scope?.baseId) binnedBaseQ = binnedBaseQ.eq('id', scope.baseId);
    const { data: binnedBases, error: bqe } = await binnedBaseQ;
    if (bqe) throw new Error(`Supabase (bases): ${bqe.message}`);
    for (const b of binnedBases ?? []) {
      const id = String((b as { id: string }).id);
      const { error: ce } = await this.client.from('base_records').delete().eq('base_id', id); // including the live rows of the base being deleted
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
    // Switching the type to number — coerce the already-stored values: parseable
    // strings become numbers (so sorting and totals work), while those that won't
    // become numbers are left as-is. We don't lose data — unlike Airtable
    // (text→attachment clears it); the UI keeps honesty about the losses by warning
    // in advance how many values won't fit.
    if (patch.type === 'number' && before && before.type !== 'number') {
      await this.coerceColumnToNumber(baseId, key);
    }
    return result;
  }
  // walk the base's rows and rewrite the column's value to a number where possible
  private async coerceColumnToNumber(baseId: string, key: string): Promise<void> {
    // as in listBases: try with the bin filter, and if the deleted_at column
    // isn't in the DB yet (migration not run) — take all rows
    let { data, error } = await this.client
      .from('base_records').select('id, data').eq('base_id', baseId).is('deleted_at', null);
    if (error && /deleted_at/.test(error.message)) {
      ({ data, error } = await this.client.from('base_records').select('id, data').eq('base_id', baseId));
    }
    if (error) throw new Error(`Supabase (base_records): ${error.message}`);
    for (const r of data ?? []) {
      const row = r as { id: string; data: Record<string, unknown> };
      const v = row.data?.[key];
      const n = coerceToNumber(v);
      if (n === v) continue; // unchanged (unparseable, empty, already a number, or absent)
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

// one instance per process. We keep it on globalThis: in dev each route is built
// into its own bundle with its own module state, so an ordinary module variable
// isn't shared between /api/bases and /api/records — and the in-memory base
// "disappears". globalThis is shared across the process and fixes this.
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
