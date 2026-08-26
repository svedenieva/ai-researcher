import { getCustomStore } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
import { RUN_SEED_COLUMNS, researchFolder, runName } from '@/lib/research/runs';
import { serverAgentStatus, runServerResearch } from '@/lib/research/server-agent';

export const dynamic = 'force-dynamic';
// A server run is a full research pass on our key — it needs far more than the
// default 60s. Vercel caps this at the plan's limit (800s, 1800s beta); if the
// plan can't grant it, the run truncates rather than failing silently.
export const maxDuration = 300;

// Roadmap step 3: run ONE server-side agent for a research question, on our key,
// and write the result into a fresh run base. OFF by default — returns 403 until
// ANTHROPIC_API_KEY and RESEARCH_SERVER_AGENT=1 are both set (see
// lib/research/server-agent.ts). The default flow stays the deeplink in
// /api/research/start; this is the measured alternative behind the flag.
//   POST { prompt: string }  ->  { baseId, baseName, added, turns }
export async function POST(request: Request): Promise<Response> {
  const status = serverAgentStatus();
  if (!status.enabled) {
    return Response.json({ error: 'Server research is disabled', reason: status.reason }, { status: 403 });
  }

  let body: { prompt?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Malformed request' }, { status: 400 }); }
  const topic = String(body?.prompt ?? '').trim();
  if (!topic) return Response.json({ error: 'Empty query' }, { status: 400 });

  const me = await currentEmail();
  const store = getCustomStore();

  try {
    const folder = await researchFolder(me);
    const base = await store.createBase({
      name: runName(topic, new Date()),
      columns: RUN_SEED_COLUMNS,
      owner: me,
      parent: folder.id,
    });
    const result = await runServerResearch({ topic, baseId: base.id, store, signal: request.signal });
    if (!result.ok) {
      // the base exists (empty) so the user can see the run was attempted
      return Response.json({ error: 'Server run failed', reason: result.reason, baseId: base.id }, { status: 502 });
    }
    return Response.json({ baseId: base.id, baseName: base.name, added: result.added, turns: result.turns });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server run failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
