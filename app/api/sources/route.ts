import { currentEmail } from '@/lib/current-user';
import { getSourceStore, normalizeType, type NewTrustedSource } from '@/lib/research/sources';
import { publicError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

// The trusted-sources registry is company-wide: any signed-in user may read and
// edit it. Auth itself is enforced by the middleware; here we only require a
// user to be resolvable.
async function requireUser(): Promise<string | Response> {
  const me = await currentEmail();
  if (!me) return Response.json({ error: 'Не вдалося визначити користувача' }, { status: 401 });
  return me;
}

function parseBody(body: Record<string, unknown>): NewTrustedSource | null {
  const name = String(body?.name ?? '').trim();
  const url = String(body?.url ?? '').trim();
  if (!name) return null;
  const topics = Array.isArray(body?.topics)
    ? [...new Set((body.topics as unknown[]).map((t) => String(t).trim().toLowerCase()).filter(Boolean))]
    : [];
  return { name, url, type: normalizeType(body?.type), topics, note: body?.note ? String(body.note) : null };
}

export async function GET(): Promise<Response> {
  const me = await requireUser();
  if (me instanceof Response) return me;
  try {
    return Response.json({ sources: await getSourceStore().list() });
  } catch (e) {
    return Response.json({ error: publicError(e, 'Не вдалося прочитати реєстр джерел', 'list sources failed') }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const me = await requireUser();
  if (me instanceof Response) return me;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Некоректний запит' }, { status: 400 }); }
  const def = parseBody(body);
  if (!def) return Response.json({ error: 'Потрібна назва джерела' }, { status: 400 });
  try {
    return Response.json({ source: await getSourceStore().add(def) });
  } catch (e) {
    return Response.json({ error: publicError(e, 'Не вдалося додати джерело', 'add source failed') }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const me = await requireUser();
  if (me instanceof Response) return me;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Некоректний запит' }, { status: 400 }); }
  const id = String(body?.id ?? '');
  if (!id) return Response.json({ error: 'Не вказано джерело' }, { status: 400 });
  const def = parseBody(body);
  if (!def) return Response.json({ error: 'Потрібна назва джерела' }, { status: 400 });
  try {
    const source = await getSourceStore().update(id, def);
    if (!source) return Response.json({ error: 'Джерело не знайдено' }, { status: 404 });
    return Response.json({ source });
  } catch (e) {
    return Response.json({ error: publicError(e, 'Не вдалося змінити джерело', 'update source failed') }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const me = await requireUser();
  if (me instanceof Response) return me;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Некоректний запит' }, { status: 400 }); }
  const id = String(body?.id ?? '');
  if (!id) return Response.json({ error: 'Не вказано джерело' }, { status: 400 });
  try {
    const ok = await getSourceStore().remove(id);
    return Response.json({ deleted: ok ? id : null });
  } catch (e) {
    return Response.json({ error: publicError(e, 'Не вдалося видалити джерело', 'delete source failed') }, { status: 500 });
  }
}
