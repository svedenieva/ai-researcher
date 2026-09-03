import { currentEmail } from '@/lib/current-user';
import { canAccessBase, getCustomStore } from '@/lib/datasource/customStore';
import { BASES } from '@/lib/datasource/bases';
import { MODE_KEY, MODE_REFERENCE } from '@/lib/mode';
import { canPromote, type PromoteReason } from '@/lib/research/promote';

export const dynamic = 'force-dynamic';

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

// ТР-ПА-02: перевод «Черновик → Эталон». Переводим только записи с проверенной
// цитатой и рабочей ссылкой; кто и когда — пишем в __promoted (jsonb-история).
//   POST { base, ids: string[] } -> { promoted, skipped: [{id, reason}] }
export async function POST(request: Request): Promise<Response> {
  let body: { base?: unknown; ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed request' }, { status: 400 });
  }
  const baseId = String(body?.base ?? '');
  const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  if (!baseId || BUILTIN_IDS.has(baseId) || !ids.length) {
    return Response.json({ error: 'Nothing to promote' }, { status: 400 });
  }

  const store = getCustomStore();
  const me = await currentEmail();
  const base = await store.getBase(baseId);
  if (!base || !canAccessBase(base, me)) {
    return Response.json({ error: 'Base not found, or no access' }, { status: 404 });
  }

  try {
    const rows = await store.listRecords(baseId);
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const at = new Date().toISOString();
    let promoted = 0;
    const skipped: Array<{ id: string; reason: PromoteReason | 'not-found' }> = [];

    for (const id of ids) {
      const rec = byId.get(id);
      if (!rec) { skipped.push({ id, reason: 'not-found' }); continue; }
      const gate = canPromote(rec, base.columns);
      if (!gate.ok) { skipped.push({ id, reason: gate.reason! }); continue; }
      await store.updateRecord(baseId, id, { [MODE_KEY]: MODE_REFERENCE, __promoted: { by: me ?? '', at } });
      promoted += 1;
    }

    return Response.json({ promoted, skipped });
  } catch (e) {
    console.error('promote failed:', e);
    return Response.json({ error: 'Could not promote' }, { status: 500 });
  }
}
