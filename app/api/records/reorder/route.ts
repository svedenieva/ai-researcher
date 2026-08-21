import { BASES } from '@/lib/datasource/bases';
import { getCustomStore, canAccessBase } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
import { publicError } from '@/lib/errors';

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

// manual row order: the client sends the full list of ids in the desired order,
// the server assigns positions. Built-in bases (catalog slices) are read-only.
export async function POST(request: Request): Promise<Response> {
  let body: { base?: unknown; order?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Malformed request' }, { status: 400 }); }
  const baseId = String(body?.base ?? '');
  const order = Array.isArray(body?.order) ? body.order.map(String) : [];
  if (!baseId || BUILTIN_IDS.has(baseId) || !order.length) {
    return Response.json({ error: 'Rows in this base cannot be reordered' }, { status: 400 });
  }
  try {
    const store = getCustomStore();
    const base = await store.getBase(baseId);
    const me = await currentEmail();
    if (!base || !canAccessBase(base, me)) return Response.json({ error: 'Base not found' }, { status: 404 });
    const reordered = await store.reorderRecords(baseId, order);
    return Response.json({ reordered });
  } catch (e) {
    return Response.json({ error: publicError(e, 'Could not change the order', 'reorderRecords failed') }, { status: 500 });
  }
}
