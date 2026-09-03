import { getCustomStore } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
import { researchDeeplinks } from '@/lib/research/deeplink';
import { RUN_SEED_COLUMNS, researchFolder, runName } from '@/lib/research/runs';
import { serverAgentStatus } from '@/lib/research/server-agent';
import { findTopicBase } from '@/lib/research/topic-guard';

export const dynamic = 'force-dynamic';

// Start a research run (Variant C): create a private "run base" owned by the
// current user (their Claude will later write the result into it via the
// connector) and return a deeplink that opens the user's own Claude with a
// ready-made prompt.
export async function POST(request: Request): Promise<Response> {
  let body: { prompt?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Malformed request' }, { status: 400 }); }
  const topic = String(body?.prompt ?? '').trim();
  if (!topic) return Response.json({ error: 'Empty query' }, { status: 400 });

  const me = await currentEmail();
  // owner===null is, by design, a base visible to EVERYONE (see canAccessBase).
  // Never create one from an unauthenticated request — defence in depth behind
  // the middleware, which is the only other thing standing here.
  if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const store = getCustomStore();

  // ТР-ПИ-03: перед запуском проверяем накопленное. Если по этой теме уже есть
  // база и она ЗАКРЫТА — прогон не запускаем (никаких обращений наружу), а
  // возвращаем накопленное. Совпадение — по формулировке искомого или названию.
  try {
    const existing = findTopicBase(await store.listBases(me), topic);
    if (existing?.closed) {
      return Response.json({ closed: true, baseId: existing.id, baseName: existing.name });
    }
  } catch {
    // проверка накопленного не должна ронять запуск — если список баз недоступен,
    // просто продолжаем как обычно
  }

  // short date in the name so runs don't collide; the slug adds a numeric
  // suffix on any remaining clash
  const name = runName(topic, new Date());

  try {
    // runs are filed under the person's "Исследования" folder rather than
    // dropped at the root, where abandoned ones used to pile up unlabelled
    const folder = await researchFolder(me);
    const base = await store.createBase({ name, columns: RUN_SEED_COLUMNS, owner: me, parent: folder.id });
    const links = researchDeeplinks(topic, base.id);
    return Response.json({
      baseId: base.id,
      baseName: base.name,
      web: links.web,
      desktop: links.desktop,
      instruction: links.instruction,
      // informational: is the server-side path (roadmap step 3) switched on?
      // the default flow is still the deeplink above; a UI can offer the server
      // run at /api/research/server when this is true.
      serverAgent: serverAgentStatus().enabled,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not create the run base';
    return Response.json({ error: msg }, { status: 500 });
  }
}
