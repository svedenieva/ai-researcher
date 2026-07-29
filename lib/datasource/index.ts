import catalog from '@/data/catalog.json';
import { JsonDataSource } from './json';
import { CATALOG_COLUMNS } from './columns';
import type { CatalogRecord, DataSource } from './types';

// DATA_SOURCE is reserved for a future 'supabase' adapter; JSON is the default.
export function getDataSource(): DataSource {
  return new JsonDataSource(catalog as CatalogRecord[], CATALOG_COLUMNS);
}
