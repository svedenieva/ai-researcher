// Merging duplicate rows in a base. "Duplicate" = the same value in the base's
// key column (case-insensitive), which is how add_rows already dedupes on the
// way in — this cleans up the ones that got in before, or from other sources.
//
// Merging is non-destructive in spirit: one row is KEPT, its empty cells are
// filled from the duplicates (so no collected fact is lost), and the rest are
// removed (soft-deleted — recoverable from the bin). The plan is pure and
// testable; applying it (update + soft-delete) is the route's job.

export interface DedupeAction {
  keepId: string;
  /** cells to fill on the kept row (only empty ones, taken from a duplicate) */
  patch: Record<string, unknown>;
  /** the duplicate rows to remove */
  removeIds: string[];
}

function norm(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}

/**
 * Group rows by the normalised value of `keyField` and, for every group with
 * more than one row, keep the first and plan to fold the rest into it. Rows with
 * an empty key value are left alone (a blank name isn't a "duplicate").
 * Order is preserved, so "the first" is the earliest row in the list.
 */
export function planDedupe(rows: Record<string, unknown>[], keyField: string): DedupeAction[] {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const k = norm(r[keyField]);
    if (!k) continue;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  const actions: DedupeAction[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [keep, ...dups] = group;

    // fill the kept row's empty cells from the first duplicate that has a value
    const keys = new Set<string>();
    for (const row of group) for (const key of Object.keys(row)) if (key !== 'id') keys.add(key);

    const patch: Record<string, unknown> = {};
    for (const key of keys) {
      if (!isEmpty(keep[key])) continue;
      const donor = dups.find((d) => !isEmpty(d[key]));
      if (donor) patch[key] = donor[key];
    }

    actions.push({
      keepId: String(keep.id),
      patch,
      removeIds: dups.map((d) => String(d.id)),
    });
  }
  return actions;
}

/** How many rows a plan would remove — for the confirmation copy and the report. */
export function countRemovals(actions: DedupeAction[]): number {
  return actions.reduce((n, a) => n + a.removeIds.length, 0);
}
