import type { CatalogRecord } from './types';
import { CATALOG_COLUMNS } from './columns';

// In the catalog the same company is sometimes entered twice — with one site but
// a different vertical, popularity, and verdict. When grouping, it landed in two
// different groups and looked like two companies. We collapse such records into one
// on read: the key is the site (otherwise the name), the "stronger" record of the
// pair is kept by popularity, then by verdict, and the lost vertical is appended to
// the survivor so no information is lost.

function rank(key: string, value: unknown): number {
  const col = CATALOG_COLUMNS.find((c) => c.key === key);
  if (!col?.order) return Number.MAX_SAFE_INTEGER;
  const i = col.order.indexOf(String(value ?? ''));
  return i === -1 ? col.order.length : i;
}

// The key is the name only. Joining by site is not allowed: some records have a
// shared link in url (a reddit thread, betalist), and then different companies
// would merge into one row.
function keyOf(r: CatalogRecord): string {
  return String(r.name ?? '').trim().toLowerCase();
}

export function dedupeCompanies(records: CatalogRecord[]): CatalogRecord[] {
  const byKey = new Map<string, CatalogRecord>();
  const order: string[] = [];

  for (const r of records) {
    const key = keyOf(r);
    const kept = byKey.get(key);
    if (!kept) {
      byKey.set(key, { ...r });
      order.push(key);
      continue;
    }
    // the stronger one is higher in popularity; on a tie — by verdict
    const better =
      rank('pop', r.pop) - rank('pop', kept.pop) ||
      rank('verdict', r.verdict) - rank('verdict', kept.verdict);
    const winner = better < 0 ? { ...r } : kept;
    const loser = better < 0 ? kept : r;

    // we don't lose the second classification, but keep it in a separate field: if
    // we appended it to vertical, merged values would appear in filters and grouping
    if (loser.vertical && loser.vertical !== winner.vertical) {
      winner.vertical_alt = String(loser.vertical);
    }

    byKey.set(key, winner);
  }

  return order.map((k) => byKey.get(k)!);
}
