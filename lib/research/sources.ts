import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The registry of sources the company trusts — platforms, channels, experts —
// tagged by topic. A research run consults it before searching, so the model
// starts from vetted sources instead of whatever it finds on its own.

export type SourceType = 'platform' | 'channel' | 'expert';

export interface TrustedSource {
  id: string;
  /** display name, e.g. "Andrej Karpathy", "Harvard Business Review" */
  name: string;
  /** площадка / канал / эксперт */
  type: SourceType;
  /** link to the source (profile, channel, site) */
  url: string;
  /** topic tags, lowercase, e.g. ["ai", "ml", "agents"] */
  topics: string[];
  note?: string | null;
  createdAt?: string | null;
}

export interface NewTrustedSource {
  name: string;
  type: SourceType;
  url: string;
  topics: string[];
  note?: string | null;
}

const TYPES: SourceType[] = ['platform', 'channel', 'expert'];
export function normalizeType(v: unknown): SourceType {
  return TYPES.includes(v as SourceType) ? (v as SourceType) : 'platform';
}

/** Split a free-text query into comparable lowercase words (≥2 chars, so short
    tags like "ai"/"ml" still match). */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2);
}

// Which sources apply to a research question. A source matches when one of its
// topic tags shares a whole token with the question — equal, or one is a prefix
// of the other ("ai" ↔ "ai", "agent" ↔ "agents"). Matching on prefixes rather
// than raw substrings keeps "ai" from matching "training". With no tags or no
// comparable query words the source is always included, so a thin registry
// stays useful before it is finely tagged.
export function matchSources(all: TrustedSource[], query: string): TrustedSource[] {
  const qs = words(query);
  if (!qs.length) return all;
  return all.filter((s) => {
    if (!s.topics.length) return true;
    return s.topics.some((t) => {
      const tl = t.toLowerCase();
      return qs.some((q) => q === tl || q.startsWith(tl) || tl.startsWith(q));
    });
  });
}

// ── store ────────────────────────────────────────────────────────
export interface SourceStore {
  list(): Promise<TrustedSource[]>;
  add(def: NewTrustedSource): Promise<TrustedSource>;
  update(id: string, patch: Partial<NewTrustedSource>): Promise<TrustedSource | null>;
  remove(id: string): Promise<boolean>;
}

let seq = 0;
function newId(): string {
  seq += 1;
  return `src${seq}`;
}

class MemorySourceStore implements SourceStore {
  private rows: TrustedSource[] = [];
  async list() {
    return [...this.rows];
  }
  async add(def: NewTrustedSource) {
    const row: TrustedSource = { id: newId(), ...def, note: def.note ?? null, createdAt: new Date().toISOString() };
    this.rows.push(row);
    return row;
  }
  async update(id: string, patch: Partial<NewTrustedSource>) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, patch);
    return row;
  }
  async remove(id: string) {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i < 0) return false;
    this.rows.splice(i, 1);
    return true;
  }
}

class SupabaseSourceStore implements SourceStore {
  private readonly client: SupabaseClient;
  constructor(url: string, key: string) {
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }
  private norm(row: Record<string, unknown>): TrustedSource {
    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      type: normalizeType(row.type),
      url: String(row.url ?? ''),
      topics: Array.isArray(row.topics) ? (row.topics as string[]) : [],
      note: (row.note as string) ?? null,
      createdAt: (row.created_at as string) ?? null,
    };
  }
  async list() {
    const { data, error } = await this.client.from('trusted_sources').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(`Supabase (trusted_sources): ${error.message}`);
    return (data ?? []).map((r) => this.norm(r as Record<string, unknown>));
  }
  async add(def: NewTrustedSource) {
    const { data, error } = await this.client
      .from('trusted_sources')
      .insert({ name: def.name, type: def.type, url: def.url, topics: def.topics, note: def.note ?? null })
      .select('*')
      .single();
    if (error) throw new Error(`Supabase (trusted_sources): ${error.message}`);
    return this.norm(data as Record<string, unknown>);
  }
  async update(id: string, patch: Partial<NewTrustedSource>) {
    const { data, error } = await this.client.from('trusted_sources').update(patch).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`Supabase (trusted_sources): ${error.message}`);
    return data ? this.norm(data as Record<string, unknown>) : null;
  }
  async remove(id: string) {
    const { error, count } = await this.client.from('trusted_sources').delete({ count: 'exact' }).eq('id', id);
    if (error) throw new Error(`Supabase (trusted_sources): ${error.message}`);
    return (count ?? 0) > 0;
  }
}

const g = globalThis as typeof globalThis & { __sourceStore?: SourceStore };
export function getSourceStore(): SourceStore {
  if (g.__sourceStore) return g.__sourceStore;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  g.__sourceStore =
    process.env.DATA_SOURCE === 'supabase' && url && key
      ? new SupabaseSourceStore(url, key)
      : new MemorySourceStore();
  return g.__sourceStore;
}
