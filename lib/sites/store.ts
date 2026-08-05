import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { slugId, type SiteMeta } from './site';

// Хранилище сайтов: строка-описание в таблице `sites`, сами файлы — в приватном
// бакете `sites` под ключом <id>/<путь внутри сайта>. Бакет приватный намеренно:
// файлы отдаёт роут /s/[id], который уже за авторизацией. Публичный бакет открыл
// бы каждый сайт по прямой ссылке всему интернету.

const BUCKET = 'sites';

export interface NewSite {
  name: string;
  client?: string | null;
  tags?: string[];
  note?: string | null;
  entry: string;
  fileCount: number;
  sizeBytes: number;
  owner?: string | null;
}

// Настройку делают руками в дашборде (см. docs/Гайд — модуль «Сайты»), поэтому
// «не создан бакет» и «не прогнан SQL» — ожидаемые состояния, а не сбой. Ловим
// их и подсказываем шаг, вместо того чтобы показывать сырой текст Supabase.
export class SitesNotSetUp extends Error {}

function explain(message: string): never {
  if (/bucket not found/i.test(message)) {
    throw new SitesNotSetUp('Хранилище не настроено: в Supabase нет приватного бакета «sites»');
  }
  if (/relation .*sites.* does not exist|could not find the table/i.test(message)) {
    throw new SitesNotSetUp('Таблица «sites» не создана: прогоните SQL из supabase/schema.sql');
  }
  throw new Error(message);
}

function toMeta(row: Record<string, unknown>): SiteMeta {
  return {
    id: String(row.id),
    name: String(row.name),
    client: (row.client as string) ?? null,
    tags: (row.tags as string[]) ?? [],
    note: (row.note as string) ?? null,
    entry: String(row.entry ?? 'index.html'),
    fileCount: Number(row.file_count ?? 0),
    sizeBytes: Number(row.size_bytes ?? 0),
    owner: (row.owner as string) ?? null,
    createdAt: String(row.created_at ?? ''),
  };
}

export class SiteStore {
  private readonly client: SupabaseClient;

  constructor(url: string, key: string) {
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }

  async list(): Promise<SiteMeta[]> {
    const { data, error } = await this.client
      .from('sites')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) explain(error.message);
    return (data ?? []).map((r) => toMeta(r as Record<string, unknown>));
  }

  async get(id: string): Promise<SiteMeta | null> {
    const { data, error } = await this.client.from('sites').select('*').eq('id', id).maybeSingle();
    if (error) explain(error.message);
    return data ? toMeta(data as Record<string, unknown>) : null;
  }

  async create(def: NewSite): Promise<SiteMeta> {
    const taken = new Set((await this.list()).map((s) => s.id));
    const id = slugId(def.name, taken);
    const row = {
      id,
      name: def.name,
      client: def.client ?? null,
      tags: def.tags ?? [],
      note: def.note ?? null,
      entry: def.entry,
      file_count: def.fileCount,
      size_bytes: def.sizeBytes,
      owner: def.owner ?? null,
    };
    const { data, error } = await this.client.from('sites').insert(row).select('*').single();
    if (error) explain(error.message);
    return toMeta(data as Record<string, unknown>);
  }

  async putFile(id: string, path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.client.storage
      .from(BUCKET)
      // upsert: перезалив того же файла не должен падать на «уже существует»
      .upload(`${id}/${path}`, bytes, { contentType, upsert: true });
    if (error) explain(error.message);
  }

  async readFile(id: string, path: string): Promise<Uint8Array | null> {
    const { data, error } = await this.client.storage.from(BUCKET).download(`${id}/${path}`);
    if (error) {
      // отсутствие объекта — обычный 404, а не поломка хранилища
      if (/not found/i.test(error.message) && !/bucket/i.test(error.message)) return null;
      explain(error.message);
    }
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  }

  // Storage отдаёт содержимое одной «папки» за раз, поэтому дерево обходим сами.
  async listFiles(id: string, prefix = ''): Promise<string[]> {
    const dir = prefix ? `${id}/${prefix}` : id;
    const { data, error } = await this.client.storage.from(BUCKET).list(dir, { limit: 1000 });
    if (error) explain(error.message);
    const out: string[] = [];
    for (const item of data ?? []) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      // у папки нет метаданных объекта — по этому и отличаем
      if (item.id === null) out.push(...(await this.listFiles(id, rel)));
      else out.push(rel);
    }
    return out;
  }

  async remove(id: string): Promise<void> {
    const files = await this.listFiles(id);
    if (files.length) {
      const { error } = await this.client.storage.from(BUCKET).remove(files.map((p) => `${id}/${p}`));
      if (error) explain(error.message);
    }
    const { error } = await this.client.from('sites').delete().eq('id', id);
    if (error) explain(error.message);
  }
}

const g = globalThis as typeof globalThis & { __siteStore?: SiteStore };

export function getSiteStore(): SiteStore {
  if (g.__siteStore) return g.__siteStore;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new SitesNotSetUp('Не заданы SUPABASE_URL и SUPABASE_SERVICE_KEY — сайты хранить негде');
  }
  g.__siteStore = new SiteStore(url, key);
  return g.__siteStore;
}
