import { currentEmail } from '@/lib/current-user';
import { getSiteStore, SitesNotSetUp } from '@/lib/sites/store';
import { validateUpload, type SiteFile } from '@/lib/sites/site';
import { publicError } from '@/lib/errors';

// The list of sites changes at runtime; a build-time snapshot would show yesterday's.
export const dynamic = 'force-dynamic';

function fail(e: unknown): Response {
  if (e instanceof SitesNotSetUp) return Response.json({ error: e.message }, { status: 503 });
  return Response.json({ error: publicError(e, 'Не удалось получить список сайтов', 'sites store failed') }, { status: 500 });
}

// The registry is shared: everyone signed in sees all sites. This is deliberately
// unlike knowledge bases, where records are split by owner — sites are stored for the team.
export async function GET(): Promise<Response> {
  try {
    return Response.json({ sites: await getSiteStore().list() });
  } catch (e) {
    return fail(e);
  }
}

// We create the record before uploading files: the id is needed to know where to put them.
// Counts come from the manifest — the set the client is about to send.
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

  // the same checks as in the browser: this endpoint can be reached bypassing the form
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
      files: check.value.files,
    });
    return Response.json({ site, files: check.value.files });
  } catch (e) {
    return fail(e);
  }
}
