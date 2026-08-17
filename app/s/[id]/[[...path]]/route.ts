import { getSiteStore, SitesNotSetUp } from '@/lib/sites/store';
import { bodyFrom, contentTypeFor, isSafePath } from '@/lib/sites/site';

// Live serving of an uploaded site.
//
// A limitation to keep in mind: only RELATIVE paths work. The site lives at
// /s/<id>/…, so <link href="/style.css"> goes to the domain root and won't be
// found. We don't rewrite HTML on the fly: parsing someone else's markup with
// regexes breaks on the first non-standard attribute, and the "paths without a
// leading slash" requirement is checked once when the site is built.

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

    // A bare /s/<id> is redirected to the entry page rather than served here.
    // Otherwise a relative style.css from the HTML would resolve to /s/style.css —
    // one level above the site. We redirect to entry specifically, not to /s/<id>/:
    // Next strips a trailing slash by default, which would cause a redirect loop.
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
        // type is taken from the extension — don't let the browser guess it
        'X-Content-Type-Options': 'nosniff',
        // a site can be re-uploaded at the same address, so cache only with revalidation
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
