import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { slugId, type SiteFile, type SiteMeta } from './site';

// Site storage: a descriptor row in the `sites` table, the files themselves in a
// private `sites` bucket under the key <id>/<path within the site>. The bucket is
// private deliberately: the files are served by the /s/[id] route, which is already
// behind auth. A public bucket would open every site to the whole internet by direct link.

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
  // the validated manifest — stored so the per-file upload route can check
  // each incoming path against what was actually agreed at creation time
  files: SiteFile[];
}

// Setup is done by hand in the dashboard (see docs/Гайд — the «Сайты» module), so
// "bucket not created" and "SQL not run" are expected states, not a failure. We
// catch them and hint the next step instead of showing raw Supabase text.
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
    // a row created before this column existed has no manifest — treated as
    // empty rather than crashing, but that means it accepts no file uploads
    files: (row.files as SiteFile[]) ?? [],
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
    const row: Record<string, unknown> = {
      id,
      name: def.name,
      client: def.client ?? null,
      tags: def.tags ?? [],
      note: def.note ?? null,
      entry: def.entry,
      file_count: def.fileCount,
      size_bytes: def.sizeBytes,
      owner: def.owner ?? null,
      files: def.files,
    };
    let { data, error } = await this.client.from('sites').insert(row).select('*').single();
    // the files column is added by hand (see schema.sql) — on a database where
    // that migration hasn't run yet, drop it and create the site without a
    // persisted manifest instead of failing every creation with a raw PostgREST
    // "could not find column" error. Same pattern as owner_email/shared in
    // lib/datasource/customStore.ts's createBase.
    if (error && /files/.test(error.message)) {
      delete row.files;
      ({ data, error } = await this.client.from('sites').insert(row).select('*').single());
    }
    if (error) explain(error.message);
    return toMeta(data as Record<string, unknown>);
  }

  async putFile(id: string, path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.client.storage
      .from(BUCKET)
      // upsert: re-uploading the same file must not fail with "already exists"
      .upload(`${id}/${path}`, bytes, { contentType, upsert: true });
    if (error) explain(error.message);
  }

  async readFile(id: string, path: string): Promise<Uint8Array | null> {
    const { data, error } = await this.client.storage.from(BUCKET).download(`${id}/${path}`);
    if (error) {
      // a missing object is an ordinary 404, not a storage failure
      if (/not found/i.test(error.message) && !/bucket/i.test(error.message)) return null;
      explain(error.message);
    }
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  }

  // Storage returns the contents of one "folder" at a time, so we walk the tree ourselves.
  async listFiles(id: string, prefix = ''): Promise<string[]> {
    const dir = prefix ? `${id}/${prefix}` : id;
    const { data, error } = await this.client.storage.from(BUCKET).list(dir, { limit: 1000 });
    if (error) explain(error.message);
    const out: string[] = [];
    for (const item of data ?? []) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      // a folder has no object metadata — that's how we tell them apart
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
