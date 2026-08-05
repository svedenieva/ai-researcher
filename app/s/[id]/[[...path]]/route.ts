import { getSiteStore, SitesNotSetUp } from '@/lib/sites/store';
import { bodyFrom, contentTypeFor, isSafePath } from '@/lib/sites/site';

// Живая отдача залитого сайта.
//
// Ограничение, о котором нужно помнить: работают только ОТНОСИТЕЛЬНЫЕ пути.
// Сайт лежит по адресу /s/<id>/…, поэтому <link href="/style.css"> уедет в
// корень домена и не найдётся. HTML на лету не переписываем: разбор чужой
// разметки регулярками ломается на первом же нестандартном атрибуте, а
// требование «пути без ведущего слэша» проверяется один раз при сборке сайта.

export const dynamic = 'force-dynamic';

function notFound(text: string): Response {
  return new Response(text, {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; path?: string[] }> },
): Promise<Response> {
  const { id, path } = await ctx.params;
  const segments = (path ?? []).filter(Boolean);

  try {
    const store = getSiteStore();
    const site = await store.get(id);
    if (!site) return notFound(`Сайт «${id}» не найден`);

    // Голый /s/<id> уводим на стартовую страницу, а не отдаём её здесь же.
    // Иначе относительный style.css из HTML разрешится в /s/style.css — на
    // уровень выше сайта. Редирект именно на entry, а не на /s/<id>/: слэш в
    // конце Next по умолчанию срезает сам, и получилась бы петля редиректов.
    if (segments.length === 0) {
      const url = new URL(request.url);
      url.pathname = `/s/${encodeURIComponent(id)}/${site.entry.split('/').map(encodeURIComponent).join('/')}`;
      return Response.redirect(url, 307);
    }

    const rel = segments.join('/');
    if (!isSafePath(rel)) return notFound('Недопустимый путь');

    const bytes = await store.readFile(id, rel);
    if (!bytes) return notFound(`В сайте «${site.name}» нет файла «${rel}»`);

    return new Response(bodyFrom(bytes), {
      headers: {
        'Content-Type': contentTypeFor(rel),
        // тип берём по расширению — пусть браузер не угадывает сам
        'X-Content-Type-Options': 'nosniff',
        // сайт можно перезалить под тем же адресом, поэтому кэш только с проверкой
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (e) {
    if (e instanceof SitesNotSetUp) {
      return new Response(e.message, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    const msg = e instanceof Error ? e.message : 'Ошибка отдачи сайта';
    return new Response(msg, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
