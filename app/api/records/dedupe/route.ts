import { currentEmail } from '@/lib/current-user';
import { canAccessBase, getCustomStore } from '@/lib/datasource/customStore';
import { BASES } from '@/lib/datasource/bases';
import { planDedupe, countRemovals } from '@/lib/research/dedupe';

export const dynamic = 'force-dynamic';

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

// Find rows that repeat the base's key column and merge each set into one: the
// kept row's empty cells are filled from the duplicates (nothing collected is
// lost), and the extras are soft-deleted (recoverable from the bin). Same notion
// of "duplicate" as add_rows uses on the way in.
//   POST { base }  ->  { groups, removed, filled }
export async function POST(request: Request): Promise<Response> {
  let body: { base?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed request' }, { status: 400 });
  }
  const baseId = String(body?.base ?? '');
  if (!baseId || BUILTIN_IDS.has(baseId)) {
    return Response.json({ error: 'Only your own bases can be deduped' }, { status: 400 });
  }

  const store = getCustomStore();
  const me = await currentEmail();
  const base = await store.getBase(baseId);
  if (!base || !canAccessBase(base, me)) {
    return Response.json({ error: 'Base not found, or no access' }, { status: 404 });
  }

  // dedupe by the first real column — the identifying one (name / название)
  const keyField = base.columns.find((c) => !c.key.startsWith('__'))?.key;
  if (!keyField) {
    return Response.json({ error: 'Base has no column to dedupe by' }, { status: 400 });
  }

  try {
    const rows = await store.listRecords(baseId);
    const actions = planDedupe(rows, keyField);

    let filled = 0;
    for (const action of actions) {
      if (Object.keys(action.patch).length > 0) {
        await store.updateRecord(baseId, action.keepId, action.patch);
        filled += 1;
      }
      if (action.removeIds.length) await store.softDeleteRecords(baseId, action.removeIds);
    }

    return Response.json({ groups: actions.length, removed: countRemovals(actions), filled });
  } catch (e) {
    console.error('dedupe failed:', e);
    return Response.json({ error: 'Could not merge duplicates' }, { status: 500 });
  }
}
