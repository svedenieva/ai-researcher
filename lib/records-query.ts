import { DEFAULT_BASE } from './datasource/bases';
import type { ListParams } from './datasource/types';

export interface RecordsSlice {
  base: string;
  sort?: ListParams['sort'];
  filters: Record<string, string>;
  search: string;
  /** 'all' | MODE_RESEARCH | MODE_REFERENCE */
  mode: string;
}

// The grid request and the CSV download link must describe the SAME slice —
// the export's whole promise is "what's on screen is what's in the file".
// They used to be two near-identical blocks built side by side, and they drifted:
// the export link silently dropped the mode filter, so "Проверено" on screen
// downloaded as every row. One builder, no drift.
export function recordsQuery(slice: RecordsSlice): string {
  const qs = new URLSearchParams();
  if (slice.base !== DEFAULT_BASE) qs.set('base', slice.base);
  if (slice.sort) {
    qs.set('sortKey', slice.sort.key);
    qs.set('sortDir', slice.sort.dir);
  }
  for (const [key, value] of Object.entries(slice.filters)) qs.append('f', `${key}:${value}`);
  if (slice.search.trim()) qs.set('q', slice.search.trim());
  if (slice.mode !== 'all') qs.set('mode', slice.mode);
  return qs.toString();
}
