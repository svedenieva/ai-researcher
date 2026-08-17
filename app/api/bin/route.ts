import { getCustomStore, canAccessBase, type CustomBase } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

// The recycle bin is private: a person sees and empties only the deleted bases
// and rows accessible to them (own / shared / ownerless), not others' private ones.
async function accessibleBinFor(me: string | null) {
  const store = getCustomStore();
  const bin = await store.listBin();
  const all = await store.listAllBases();
  const access = new Map<string, boolean>();
  for (const b of [...all, ...bin.bases] as CustomBase[]) access.set(b.id, canAccessBase(b, me));
  return {
    store,
    bases: bin.bases.filter((b) => access.get(b.id)),
    records: bin.records.filter((r) => access.get(r.baseId)),
  };
}

export async function GET(): Promise<Response> {
  const me = await currentEmail();
  const { bases, records } = await accessibleBinFor(me);
  return Response.json({ bases, records });
}

export async function DELETE(request: Request): Promise<Response> {
  let body: { confirm?: unknown; baseId?: unknown } = {};
  try { body = await request.json(); } catch { /* empty body = dry-run all */ }
  const me = await currentEmail();
  const { store, bases, records } = await accessibleBinFor(me);
  const scopeId = typeof body?.baseId === 'string' && body.baseId ? body.baseId : null;

  // restrict the scope to only the ids accessible to the user
  const scopedBases = scopeId ? bases.filter((b) => b.id === scopeId) : bases;
  const scopedRecords = scopeId ? records.filter((r) => r.baseId === scopeId) : records;
  if (scopeId && !scopedBases.length && !scopedRecords.length) {
    return Response.json({ error: 'Нет доступа к этой базе' }, { status: 404 });
  }

  if (body?.confirm !== true) {
    return Response.json({
      dryRun: true,
      wouldDelete: { bases: scopedBases.map((b) => b.name), baseCount: scopedBases.length, records: scopedRecords.length },
    });
  }

  // empty each accessible id separately — we don't touch other people's bins
  const ids = new Set<string>([...scopedBases.map((b) => b.id), ...scopedRecords.map((r) => r.baseId)]);
  let bCount = 0;
  let rCount = 0;
  for (const id of ids) {
    const res = await store.emptyBin({ baseId: id });
    bCount += res.bases;
    rCount += res.records;
  }
  return Response.json({ emptied: true, bases: bCount, records: rCount });
}
