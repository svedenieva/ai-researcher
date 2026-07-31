import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { JsonDataSource } from './json';
import { withSections } from './section';
import type { CatalogRecord, ColumnDef, DataSource, ListParams } from './types';

// Reads the catalog from a Supabase table. Rows are stored as { id, data },
// where `data` is the full record. Sort/filter/search/facets reuse the same
// in-memory logic as JsonDataSource (the catalog is small), so the behaviour
// is identical whether data comes from a file or from Supabase.
export class SupabaseDataSource implements DataSource {
  private readonly client: SupabaseClient;

  constructor(
    private readonly cols: ColumnDef[],
    url: string,
    key: string,
    private readonly table = 'products',
  ) {
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }

  private async fetchAll(): Promise<CatalogRecord[]> {
    const { data, error } = await this.client.from(this.table).select('data');
    if (error) throw new Error(`Supabase (${this.table}): ${error.message}`);
    return withSections((data ?? []).map((row) => (row as { data: CatalogRecord }).data));
  }

  async columns(): Promise<ColumnDef[]> {
    return this.cols;
  }

  async list(params?: ListParams): Promise<CatalogRecord[]> {
    const rows = await this.fetchAll();
    return new JsonDataSource(rows, this.cols).list(params);
  }

  async get(id: string): Promise<CatalogRecord | null> {
    const { data, error } = await this.client
      .from(this.table)
      .select('data')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Supabase (${this.table}): ${error.message}`);
    if (!data) return null;
    return withSections([(data as { data: CatalogRecord }).data])[0];
  }

  async facets(): Promise<Record<string, string[]>> {
    const rows = await this.fetchAll();
    return new JsonDataSource(rows, this.cols).facets();
  }
}
