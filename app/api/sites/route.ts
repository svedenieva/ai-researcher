import { currentEmail } from '@/lib/current-user';
import { getSiteStore, SitesNotSetUp } from '@/lib/sites/store';
import { validateUpload, type SiteFile } from '@/lib/sites/site';

// Список сайтов меняется в рантайме, снимок со сборки показывал бы вчерашнее.
export const dynamic = 'force-dynamic';

function fail(e: unknown): Response {
  if (e instanceof SitesNotSetUp) return Response.json({ error: e.message }, { status: 503 });
  const msg = e instanceof Error ? e.message : 'Ошибка хранилища сайтов';
  return Response.json({ error: msg }, { status: 500 });
}

// Реестр общий: все, кто вошёл, видят все сайты. Это осознанно иначе, чем у баз
// знаний, где записи делятся по владельцам, — сайты складывают для команды.
export async function GET(): Promise<Response> {
  try {
    return Response.json({ sites: await getSiteStore().list() });
  } catch (e) {
    return fail(e);
  }
}

// Заводим запись до загрузки файлов: id нужен, чтобы знать, куда их класть.
// Счётчики берём из манифеста — это набор, который клиент собирается отправить.
export async function POST(request: Request): Promise<Response> {
  let body: { name?: unknown; client?: unknown; tags?: unknown; note?: unknown; files?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const name = String(body?.name ?? '').trim();
  if (!name) return Response.json({ error: 'Нужно название сайта' }, { status: 400 });

  const files: SiteFile[] = Array.isArray(body?.files)
    ? body.files
        .map((f) => ({ path: String((f as SiteFile)?.path ?? ''), size: Number((f as SiteFile)?.size ?? 0) }))
        .filter((f) => f.path)
    : [];

  // те же проверки, что и в браузере: сюда можно прийти и мимо формы
  const check = validateUpload(files);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

  const tags = Array.isArray(body?.tags)
    ? [...new Set(body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))]
    : [];

  try {
    const site = await getSiteStore().create({
      name,
      client: String(body?.client ?? '').trim() || null,
      tags,
      note: String(body?.note ?? '').trim() || null,
      entry: check.value.entry,
      fileCount: check.value.files.length,
      sizeBytes: check.value.sizeBytes,
      owner: await currentEmail(),
    });
    return Response.json({ site, files: check.value.files });
  } catch (e) {
    return fail(e);
  }
}
