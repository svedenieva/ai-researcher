import { getCustomStore, canAccessBase } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
import { extractRow, scoreRows, quoteFoundOnPage } from '@/lib/research/eval';
import { questionById } from '@/lib/research/eval-set';

export const dynamic = 'force-dynamic';

// Score a research run base against the metrics (step 1 of the roadmap). Cheap
// metrics always; the honest quote-on-page check runs only with ?verify=1 (it
// fetches each cited page, so it's capped and off by default).
//   GET /api/research/eval?base=<runBaseId>&q=<evalQuestionId>&verify=1
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const baseId = url.searchParams.get('base') ?? '';
  const qId = url.searchParams.get('q') ?? '';
  const verify = url.searchParams.get('verify') === '1';
  if (!baseId) return Response.json({ error: 'base is required' }, { status: 400 });

  const me = await currentEmail();
  const store = getCustomStore();
  let base;
  try {
    base = await store.getBase(baseId);
  } catch {
    return Response.json({ error: 'Could not read the base' }, { status: 500 });
  }
  if (!base || !canAccessBase(base, me)) {
    return Response.json({ error: 'Base not found' }, { status: 404 });
  }

  const rows = (await store.listRecords(baseId)).map(extractRow);
  const q = qId ? questionById(qId) : undefined;
  const score = scoreRows(rows, q?.subtopics ?? []);

  let verifyBlock: { checked: number; found: number; quoteFoundRate: number } | undefined;
  if (verify) {
    const CAP = 30; // one page fetch per row — bound it
    const withBoth = rows.filter((r) => r.link && r.quote.replace(/\s+/g, ' ').trim().length >= 12).slice(0, CAP);
    const found = (await Promise.all(withBoth.map((r) => quoteFoundOnPage(r.link, r.quote)))).filter(Boolean).length;
    verifyBlock = { checked: withBoth.length, found, quoteFoundRate: withBoth.length ? found / withBoth.length : 0 };
  }

  return Response.json({
    base: baseId,
    question: q?.question,
    ...score,
    ...(verifyBlock ? { verify: verifyBlock } : {}),
  });
}
