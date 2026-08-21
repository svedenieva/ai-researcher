import { getSiteStore, SitesNotSetUp } from '@/lib/sites/store';
import { contentTypeFor, isSafePath, MAX_FILE_BYTES } from '@/lib/sites/site';

// One file per request. No batching: a serverless request on Vercel won't accept
// a body larger than ~4.5 MB, and a site with images easily exceeds that in one chunk.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Ожидается multipart/form-data' }, { status: 400 });
  }

  const path = String(form.get('path') ?? '');
  const file = form.get('file');
  if (!path || !(file instanceof Blob)) {
    return Response.json({ error: 'Нужны поля path и file' }, { status: 400 });
  }
  // the key is joined as <id>/<path> — '..' would divert the write into another site
  if (!isSafePath(path)) return Response.json({ error: `Недопустимый путь: «${path}»` }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: `Файл «${path}» больше 10 МБ` }, { status: 400 });
  }

  try {
    const store = getSiteStore();
    // without a row in the table the file would hang in storage owned by no one
    const site = await store.get(id);
    if (!site) return Response.json({ error: 'Сайт не найден' }, { status: 404 });
    // The manifest is the contract agreed at validateUpload time. Accepting a
    // path outside it turned this route into unbounded storage: MAX_FILES and
    // the total-size ceiling were both bypassed one request at a time.
    if (!(site.files ?? []).some((f) => f.path === path)) {
      return Response.json({ error: `Файла «${path}» нет в составе сайта` }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await store.putFile(id, path, bytes, contentTypeFor(path));
    return Response.json({ ok: true, path, size: bytes.length });
  } catch (e) {
    if (e instanceof SitesNotSetUp) return Response.json({ error: e.message }, { status: 503 });
    const msg = e instanceof Error ? e.message : 'Не удалось записать файл';
    return Response.json({ error: msg }, { status: 500 });
  }
}
