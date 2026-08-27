import { currentEmail } from '@/lib/current-user';
import { getCustomStore } from '@/lib/datasource/customStore';
import { listRuns, tidyRuns } from '@/lib/research/runs';
import { serverAgentStatus } from '@/lib/research/server-agent';

export const dynamic = 'force-dynamic';

// Your research runs, newest first, each with how many rows it actually got.
// Without this the only trace of a run was a base sitting in the tree: you
// couldn't tell an abandoned empty run from a real base, and a reload lost the
// one you were waiting on.
export async function GET(): Promise<Response> {
  const me = await currentEmail();
  const store = getCustomStore();
  const bases = await listRuns(me);

  const runs = await Promise.all(
    bases.map(async (b) => ({
      id: b.id,
      name: b.name,
      createdAt: b.createdAt ?? null,
      rows: (await store.listRecords(b.id)).length,
    })),
  );

  runs.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  // whether the server-side research path is switched on — the page uses it to
  // decide if it should offer a "run on the server" button beside the deeplink
  return Response.json({ runs, serverAgent: serverAgentStatus().enabled });
}

// File older root-level runs into the folder — one click to clear the clutter
// that accumulated before runs were filed automatically.
export async function POST(): Promise<Response> {
  const me = await currentEmail();
  try {
    return Response.json({ moved: await tidyRuns(me) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Could not tidy the runs' }, { status: 500 });
  }
}
