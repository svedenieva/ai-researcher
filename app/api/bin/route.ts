import { currentEmail } from '@/lib/current-user';
// The private-bin rule is shared with the MCP connector — see lib/datasource/binAccess
import { accessibleBinFor, emptyScope, scopeBin } from '@/lib/datasource/binAccess';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const me = await currentEmail();
  const { bases, records } = await accessibleBinFor(me);
  return Response.json({ bases, records });
}

export async function DELETE(request: Request): Promise<Response> {
  let body: { confirm?: unknown; baseId?: unknown } = {};
  try { body = await request.json(); } catch { /* empty body = dry-run all */ }
  const me = await currentEmail();
  const bin = await accessibleBinFor(me);
  const scopeId = typeof body?.baseId === 'string' && body.baseId ? body.baseId : null;

  // restrict the scope to only the ids accessible to the user
  const scoped = scopeBin(bin, scopeId);
  if (scopeId && !scoped.bases.length && !scoped.records.length) {
    return Response.json({ error: 'No access to this base' }, { status: 404 });
  }

  if (body?.confirm !== true) {
    return Response.json({
      dryRun: true,
      wouldDelete: { bases: scoped.bases.map((b) => b.name), baseCount: scoped.bases.length, records: scoped.records.length },
    });
  }

  // empty each accessible id separately — we don't touch other people's bins
  const { bases, records } = await emptyScope(bin.store, scoped);
  return Response.json({ emptied: true, bases, records });
}
