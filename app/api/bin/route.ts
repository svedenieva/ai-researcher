import { getCustomStore } from '@/lib/datasource/customStore';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const bin = await getCustomStore().listBin();
  return Response.json(bin);
}

export async function DELETE(request: Request): Promise<Response> {
  let body: { confirm?: unknown; baseId?: unknown } = {};
  try { body = await request.json(); } catch { /* empty body = dry-run all */ }
  const store = getCustomStore();
  const scope = typeof body?.baseId === 'string' && body.baseId ? { baseId: body.baseId } : undefined;
  if (body?.confirm !== true) {
    const bin = await store.listBin();
    const bases = scope ? bin.bases.filter((b) => b.id === scope.baseId) : bin.bases;
    const records = scope ? bin.records.filter((r) => r.baseId === scope.baseId) : bin.records;
    return Response.json({ dryRun: true, wouldDelete: { bases: bases.map((b) => b.name), baseCount: bases.length, records: records.length } });
  }
  const res = await store.emptyBin(scope);
  return Response.json({ emptied: true, ...res });
}
