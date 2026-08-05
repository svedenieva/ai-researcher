import { getSiteStore, SitesNotSetUp } from '@/lib/sites/store';
import { zipEntries } from '@/lib/sites/zip';
import { bodyFrom } from '@/lib/sites/site';

// Забрать сайт обратно одним архивом. Собираем на лету: держать готовый zip
// рядом с файлами значило бы поддерживать его в актуальном состоянии.
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const store = getSiteStore();
    const site = await store.get(id);
    if (!site) return Response.json({ error: 'Сайт не найден' }, { status: 404 });

    const paths = await store.listFiles(id);
    if (!paths.length) return Response.json({ error: 'У сайта нет файлов' }, { status: 404 });

    const entries = [];
    for (const path of paths) {
      const bytes = await store.readFile(id, path);
      if (bytes) entries.push({ path, bytes });
    }
    const zip = zipEntries(entries);

    // id бывает кириллическим — в заголовок его голым класть нельзя. Даём
    // ascii-запаску и рядом filename* с процентным кодированием (RFC 5987).
    const ascii = id.replace(/[^\x20-\x7e]/g, '_');
    const disposition = `attachment; filename="${ascii}.zip"; filename*=UTF-8''${encodeURIComponent(id)}.zip`;

    return new Response(bodyFrom(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': disposition,
        'Content-Length': String(zip.length),
      },
    });
  } catch (e) {
    if (e instanceof SitesNotSetUp) return Response.json({ error: e.message }, { status: 503 });
    const msg = e instanceof Error ? e.message : 'Не удалось собрать архив';
    return Response.json({ error: msg }, { status: 500 });
  }
}
