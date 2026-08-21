import { getSiteStore, SitesNotSetUp } from '@/lib/sites/store';
import { zipEntries } from '@/lib/sites/zip';
import { bodyFrom } from '@/lib/sites/site';

// Grab the site back as a single archive. Built on the fly: keeping a ready-made zip
// next to the files would mean having to keep it up to date.
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const store = getSiteStore();
    const site = await store.get(id);
    if (!site) return Response.json({ error: 'Site not found' }, { status: 404 });

    const paths = await store.listFiles(id);
    if (!paths.length) return Response.json({ error: 'The site has no files' }, { status: 404 });

    const entries = [];
    for (const path of paths) {
      const bytes = await store.readFile(id, path);
      if (bytes) entries.push({ path, bytes });
    }
    const zip = zipEntries(entries);

    // the id can be Cyrillic — it can't go into the header bare. We provide an
    // ascii fallback plus filename* with percent-encoding (RFC 5987).
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
    const msg = e instanceof Error ? e.message : 'Could not build the archive';
    return Response.json({ error: msg }, { status: 500 });
  }
}
