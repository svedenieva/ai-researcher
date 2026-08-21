import { getSiteStore, SitesNotSetUp } from '@/lib/sites/store';

// Deletion is irreversible: we remove the storage objects and the row. There are
// no versions, so the UI asks for confirmation — by here it's already the point of no return.
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const store = getSiteStore();
    const site = await store.get(id);
    if (!site) return Response.json({ error: 'Site not found' }, { status: 404 });
    await store.remove(id);
    return Response.json({ ok: true, id });
  } catch (e) {
    if (e instanceof SitesNotSetUp) return Response.json({ error: e.message }, { status: 503 });
    const msg = e instanceof Error ? e.message : 'Не удалось удалить сайт';
    return Response.json({ error: msg }, { status: 500 });
  }
}
