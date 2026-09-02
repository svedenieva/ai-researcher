import { getCustomStore, canAccessBase } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
import { BASES } from '@/lib/datasource/bases';
import { scrapeStatus, buildPrompt, resultToRows, mockResult, smartScrape } from '@/lib/research/scrape';
import { publicError } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // a scrape + LLM extraction can take a while

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

// Extract rows into a base from a page URL via ScrapeGraphAI (SmartScraper). The
// base's columns are the extraction schema; the returned items are added as
// rows. OFF until SCRAPEGRAPHAI_API_KEY is set (SCRAPEGRAPHAI_MOCK=1 for tests).
//   POST { base: string, url: string }  ->  { added, url }
export async function POST(request: Request): Promise<Response> {
  const status = scrapeStatus();
  if (!status.enabled) {
    return Response.json({ error: 'Витягування з URL вимкнено (немає SCRAPEGRAPHAI_API_KEY)', reason: status.reason }, { status: 403 });
  }

  let body: { base?: unknown; url?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Malformed request' }, { status: 400 }); }

  const baseId = String(body?.base ?? '');
  const url = String(body?.url ?? '').trim();
  if (!baseId || BUILTIN_IDS.has(baseId)) {
    return Response.json({ error: 'Only your own bases can be filled from a URL' }, { status: 400 });
  }
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return Response.json({ error: 'Вкажіть коректний http(s) URL' }, { status: 400 });
  }

  const store = getCustomStore();
  const me = await currentEmail();
  const base = await store.getBase(baseId);
  if (!base || !canAccessBase(base, me)) {
    return Response.json({ error: 'Base not found, or no access' }, { status: 404 });
  }

  try {
    const prompt = buildPrompt(base.columns);
    const result = status.mock
      ? mockResult(base.columns, url)
      : await smartScrape(process.env.SCRAPEGRAPHAI_API_KEY as string, url, prompt, request.signal);

    const rows = resultToRows(base.columns, result);
    if (!rows.length) {
      return Response.json({ error: 'На сторінці нічого не знайдено за схемою бази', added: 0 }, { status: 422 });
    }
    const now = new Date().toISOString();
    const stamped = rows.map((r) => ({ ...r, __source: url, __created: now, __updated: now }));
    const added = await store.addRecords(baseId, stamped);
    return Response.json({ added, url });
  } catch (e) {
    return Response.json({ error: publicError(e, 'Не вдалося витягнути дані', 'scrape failed') }, { status: 502 });
  }
}
