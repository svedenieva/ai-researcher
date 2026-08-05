import { getSiteStore, SitesNotSetUp } from '@/lib/sites/store';
import { contentTypeFor, isSafePath, MAX_FILE_BYTES } from '@/lib/sites/site';

// Один файл за запрос. Пачкой нельзя: serverless-запрос на Vercel не принимает
// тело больше ~4,5 МБ, а сайт с картинками легко перевалит за это одним куском.
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
  // ключ склеивается как <id>/<path> — '..' увёл бы запись в чужой сайт
  if (!isSafePath(path)) return Response.json({ error: `Недопустимый путь: «${path}»` }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: `Файл «${path}» больше 10 МБ` }, { status: 400 });
  }

  try {
    const store = getSiteStore();
    // без записи в таблице файл повис бы в хранилище ничьим
    if (!(await store.get(id))) return Response.json({ error: 'Сайт не найден' }, { status: 404 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    await store.putFile(id, path, bytes, contentTypeFor(path));
    return Response.json({ ok: true, path, size: bytes.length });
  } catch (e) {
    if (e instanceof SitesNotSetUp) return Response.json({ error: e.message }, { status: 503 });
    const msg = e instanceof Error ? e.message : 'Не удалось записать файл';
    return Response.json({ error: msg }, { status: 500 });
  }
}
