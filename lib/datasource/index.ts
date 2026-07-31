import catalog from '@/data/catalog.json';
import { JsonDataSource } from './json';
import { SupabaseDataSource } from './supabase';
import { CATALOG_COLUMNS } from './columns';
import { withSections } from './section';
import type { CatalogRecord, DataSource } from './types';

// Same DataSource interface, two backends. Set DATA_SOURCE=supabase (with
// SUPABASE_URL + SUPABASE_SERVICE_KEY) to read from the database; otherwise
// the app reads the bundled JSON catalog. The UI never changes.
export function getDataSource(): DataSource {
  if (process.env.DATA_SOURCE === 'supabase') {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (url && key) return new SupabaseDataSource(CATALOG_COLUMNS, url, key);
    throw new Error('DATA_SOURCE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_KEY');
  }
  return new JsonDataSource(withSections(catalog as CatalogRecord[]), CATALOG_COLUMNS);
}
