import { currentEmail } from '@/lib/current-user';
import { canAccessBase, getCustomStore } from '@/lib/datasource/customStore';
import { BASES } from '@/lib/datasource/bases';
import { sharingEnabled, shareToken } from '@/lib/research/share';

export const dynamic = 'force-dynamic';

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

// Give the owner a public read-only link for one of their bases. Only an owner
// (or someone who can already access it) can mint the link; the token itself is
// an HMAC, so it can't be forged. Off unless RESEARCH_SHARE_SECRET is set.
//   GET /api/records/share-link?base=<id>  ->  { url }
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const baseId = url.searchParams.get('base') ?? '';
  if (!baseId || BUILTIN_IDS.has(baseId)) {
    return Response.json({ error: 'Only your own bases can be shared' }, { status: 400 });
  }
  if (!sharingEnabled()) {
    return Response.json({ error: 'Публичные ссылки выключены (нет RESEARCH_SHARE_SECRET)' }, { status: 400 });
  }

  const store = getCustomStore();
  const me = await currentEmail();
  const base = await store.getBase(baseId);
  if (!base || !canAccessBase(base, me)) {
    return Response.json({ error: 'Base not found, or no access' }, { status: 404 });
  }

  const token = shareToken(baseId);
  return Response.json({ url: `${url.origin}/p/${encodeURIComponent(baseId)}?t=${token}` });
}
