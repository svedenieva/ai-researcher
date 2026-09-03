import { getCustomStore, canAccessBase } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
import { researchDeeplinks } from '@/lib/research/deeplink';
import { RUN_SEED_COLUMNS, researchFolder, runName } from '@/lib/research/runs';
import { serverAgentStatus } from '@/lib/research/server-agent';
import { findTopicBase } from '@/lib/research/topic-guard';
import { descendantsOf } from '@/lib/datasource/tree';
import { recordMode, MODE_REFERENCE } from '@/lib/mode';

export const dynamic = 'force-dynamic';

// Start a research run (Variant C): create a private "run base" owned by the
// current user (their Claude will later write the result into it via the
// connector) and return a deeplink that opens the user's own Claude with a
// ready-made prompt.
// эталонные записи темы (по базе и всем её потомкам): { baseId: ids[] }
async function referenceRecords(store: ReturnType<typeof getCustomStore>, baseId: string): Promise<Record<string, string[]>> {
  const all = await store.listAllBases();
  const bases = [baseId, ...descendantsOf(all, baseId)];
  const out: Record<string, string[]> = {};
  for (const b of bases) {
    const rows = await store.listRecords(b);
    const ids = rows.filter((r) => recordMode(r) === MODE_REFERENCE).map((r) => String(r.id));
    if (ids.length) out[b] = ids;
  }
  return out;
}

export async function POST(request: Request): Promise<Response> {
  let body: { prompt?: unknown; intent?: unknown; baseId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Malformed request' }, { status: 400 }); }
  const topic = String(body?.prompt ?? '').trim();
  if (!topic) return Response.json({ error: 'Empty query' }, { status: 400 });
  const intent = ['new', 'append', 'replace'].includes(String(body?.intent)) ? (String(body.intent) as 'new' | 'append' | 'replace') : null;
  const targetBaseId = typeof body?.baseId === 'string' ? body.baseId : '';

  const me = await currentEmail();
  // owner===null is, by design, a base visible to EVERYONE (see canAccessBase).
  // Never create one from an unauthenticated request — defence in depth behind
  // the middleware, which is the only other thing standing here.
  if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const store = getCustomStore();

  // ТР-ПА-03: осознанный выбор пользователя при существующем эталоне.
  //   append  — дополнить: прогон идёт в ту же базу, эталон не трогаем.
  //   replace — заменить: прежний эталон уходит в корзину (НФТ-08 — версия
  //             сохраняется, её можно вернуть), затем прогон в ту же базу.
  if ((intent === 'append' || intent === 'replace') && targetBaseId) {
    const target = await store.getBase(targetBaseId);
    if (!target || !canAccessBase(target, me)) return Response.json({ error: 'Base not found' }, { status: 404 });
    if (intent === 'replace') {
      const refs = await referenceRecords(store, targetBaseId);
      for (const [b, ids] of Object.entries(refs)) await store.softDeleteRecords(b, ids);
    }
    const links = researchDeeplinks(topic, targetBaseId);
    return Response.json({ baseId: targetBaseId, baseName: target.name, web: links.web, desktop: links.desktop, instruction: links.instruction, serverAgent: serverAgentStatus().enabled });
  }

  // ТР-ПИ-03 + ТР-ПА-03: перед запуском проверяем накопленное. По ЗАКРЫТОЙ теме
  // прогон не запускаем; если у неё уже есть эталон — сообщаем сколько, чтобы UI
  // предложил дополнить/заменить/создать. intent==='new' пропускает эту проверку.
  if (intent !== 'new') {
    try {
      const existing = findTopicBase(await store.listBases(me), topic);
      if (existing?.closed) {
        const refs = await referenceRecords(store, existing.id);
        const referenceCount = Object.values(refs).reduce((n, ids) => n + ids.length, 0);
        return Response.json({ closed: true, baseId: existing.id, baseName: existing.name, referenceCount });
      }
    } catch {
      // проверка накопленного не должна ронять запуск
    }
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
