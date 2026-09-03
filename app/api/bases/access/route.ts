import { currentEmail } from '@/lib/current-user';
import { getCustomStore } from '@/lib/datasource/customStore';
import { BASES } from '@/lib/datasource/bases';

export const dynamic = 'force-dynamic';

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

// ТР-БД-03: владелец выдаёт/отзывает доступ к своей базе конкретным людям.
// Управлять доступом может ТОЛЬКО владелец базы (не «общая»/ownerless).

async function ownerGate(baseId: string) {
  const me = await currentEmail();
  if (!me) return { error: 'Unauthorized', status: 401 as const };
  if (!baseId || BUILTIN_IDS.has(baseId)) return { error: 'This base cannot be shared', status: 400 as const };
  const store = getCustomStore();
  const base = await store.getBase(baseId);
  if (!base) return { error: 'Base not found', status: 404 as const };
  if (base.owner !== me) return { error: 'Only the owner can manage access', status: 403 as const };
  return { store, me };
}

function normEmail(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

export async function GET(request: Request): Promise<Response> {
  const baseId = new URL(request.url).searchParams.get('base') ?? '';
  const gate = await ownerGate(baseId);
  if ('error' in gate) return Response.json({ error: gate.error }, { status: gate.status });
  return Response.json({ emails: await gate.store.listAccess(baseId) });
}

export async function POST(request: Request): Promise<Response> {
  let body: { base?: unknown; email?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Malformed request' }, { status: 400 }); }
  const baseId = String(body?.base ?? '');
  const email = normEmail(body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'A valid email is required' }, { status: 400 });
  const gate = await ownerGate(baseId);
  if ('error' in gate) return Response.json({ error: gate.error }, { status: gate.status });
  if (email === gate.me) return Response.json({ error: 'You already own this base' }, { status: 400 });
  await gate.store.grantAccess(baseId, email);
  return Response.json({ emails: await gate.store.listAccess(baseId) });
}

export async function DELETE(request: Request): Promise<Response> {
  let body: { base?: unknown; email?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Malformed request' }, { status: 400 }); }
  const baseId = String(body?.base ?? '');
  const email = normEmail(body?.email);
  const gate = await ownerGate(baseId);
  if ('error' in gate) return Response.json({ error: gate.error }, { status: gate.status });
  await gate.store.revokeAccess(baseId, email);
  return Response.json({ emails: await gate.store.listAccess(baseId) });
}
