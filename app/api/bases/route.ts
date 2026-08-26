import { BASES } from '@/lib/datasource/bases';
import { currentEmail } from '@/lib/current-user';
import { getCustomStore, canAccessBase, RESERVED_COLUMN_KEYS, type CustomBase } from '@/lib/datasource/customStore';
import type { ColumnDef } from '@/lib/datasource/types';
import { checkName, checkPayload, checkRowCount } from '@/lib/limits';
import { publicError } from '@/lib/errors';

// GET takes no request, so by default Next would serve a snapshot taken
// at build time — the list of bases would "freeze" until the next deploy.
// Bases change at runtime (created from the UI), so the route is dynamic.
export const dynamic = 'force-dynamic';

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

interface BaseDTO {
  id: string;
  name: string;
  tone: string;
  builtin: boolean;
  parent: string | null;
  /** who created the base; null for team/legacy bases. Built-in slices have none. */
  owner?: string | null;
  /** ISO creation date — shown in the showcase preview */
  createdAt?: string | null;
}

// list of all bases for the switcher: built-in first (catalog slices),
// then custom ones (from the DB). parent → tree in the picker.
export async function GET(): Promise<Response> {
  const builtin: BaseDTO[] = BASES.map((b) => ({ id: b.id, name: b.name, tone: b.tone, builtin: true, parent: null }));
  let custom: BaseDTO[] = [];
  try {
    // Privacy model: a person sees their own bases, shared ones, and ownerless
    // ones (the team knowledge base). Other people's private bases are excluded.
    const me = await currentEmail();
    const rows = await getCustomStore().listBases(me);
    const visible = new Set([...rows.map((b) => b.id), ...BASES.map((b) => b.id)]);
    custom = rows
      // a base whose parent no longer exists surfaces at the top level,
      // otherwise it would get lost in the tree
      .map((b) => ({
        id: b.id,
        name: b.name,
        tone: b.tone,
        builtin: false,
        parent: b.parent && visible.has(b.parent) ? b.parent : null,
        // Never hand one person another's email. A shared or ownerless base is
        // visible to the whole team, but the owner address is personal data —
        // expose it only when the base is the caller's own.
        owner: b.owner && b.owner === me ? b.owner : null,
        createdAt: b.createdAt ?? null,
      }));
  } catch (e) {
    // if custom bases are unavailable (no tables) — show at least the built-in ones
    console.error('listBases failed:', e);
  }
  return Response.json({ bases: [...builtin, ...custom] });
}

// normalize columns from the form into valid ColumnDef
function normalizeColumns(input: unknown): ColumnDef[] {
  if (!Array.isArray(input)) return [];
  const cols: ColumnDef[] = [];
  const used = new Set<string>();
  for (const raw of input) {
    const label = String((raw as { label?: unknown })?.label ?? '').trim();
    if (!label) continue;
    let key = label.toLowerCase().replace(/[^a-zа-яёіїєґ0-9]+/gi, '_').replace(/(^_|_$)/g, '') || `col${cols.length}`;
    while (used.has(key) || RESERVED_COLUMN_KEYS.has(key)) key = `${key}_`;
    used.add(key);
    const type = (raw as { type?: unknown })?.type;
    const t: ColumnDef['type'] =
      type === 'number' || type === 'url' || type === 'long-text' || type === 'select' ? type : 'text';
    cols.push({
      key,
      label,
      type: t,
      sortable: true,
      filterable: Boolean((raw as { filterable?: unknown })?.filterable) && t !== 'long-text' && t !== 'url',
    });
  }
  return cols;
}

// positional import rows (row[i] ↔ columns[i]) → objects keyed by column keys
function mapRows(columns: ReturnType<typeof normalizeColumns>, rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const data: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      const raw = row[i];
      if (raw === undefined || raw === null || String(raw).trim() === '') return;
      const s = String(raw).trim();
      data[col.key] = col.type === 'number' ? Number(s.replace(',', '.')) : s;
    });
    if (Object.keys(data).length) out.push(data);
  }
  return out;
}

export async function POST(request: Request): Promise<Response> {
  let body: { name?: unknown; columns?: unknown; tone?: unknown; rows?: unknown; parent?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed request' }, { status: 400 });
  }
  const name = String(body?.name ?? '').trim();
  if (!name) return Response.json({ error: 'A base name is required' }, { status: 400 });
  const longName = checkName(name);
  if (longName) return Response.json({ error: longName }, { status: 400 });

  const columns = normalizeColumns(body?.columns);
  if (!columns.length) return Response.json({ error: 'Add at least one column' }, { status: 400 });

  // Validate the rows before the base is created — otherwise a rejected
  // import still leaves a real, permanent, empty base behind.
  const rows = mapRows(columns, body?.rows);
  const tooMany = checkRowCount(rows.length);
  if (tooMany) return Response.json({ error: tooMany }, { status: 400 });
  for (const row of rows) {
    const tooBig = checkPayload(row);
    if (tooBig) return Response.json({ error: tooBig }, { status: 400 });
  }

  const tone = body?.tone === 'teal' || body?.tone === 'blue' || body?.tone === 'amber' || body?.tone === 'sage'
    ? (body.tone as CustomBase['tone'])
    : undefined;
  const parent = typeof body?.parent === 'string' && body.parent ? body.parent : null;

  try {
    const store = getCustomStore();
    const owner = await currentEmail();
    const base = await store.createBase({ name, columns, tone, parent, owner });
    const imported = rows.length ? await store.addRecords(base.id, rows) : 0;
    return Response.json({ base, imported });
  } catch (e) {
    return Response.json({ error: publicError(e, 'Could not create the base', 'createBase failed') }, { status: 500 });
  }
}

// rename / move a custom base
export async function PATCH(request: Request): Promise<Response> {
  let body: { id?: unknown; name?: unknown; parent?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Malformed request' }, { status: 400 }); }
  const id = String(body?.id ?? '');
  if (!id || BUILTIN_IDS.has(id)) return Response.json({ error: 'This base cannot be changed' }, { status: 400 });
  const store = getCustomStore();
  const me = await currentEmail();
  // only an accessible base can be changed (own/shared/ownerless), not someone else's private one
  const target = await store.getBase(id);
  if (!target || !canAccessBase(target, me)) return Response.json({ error: 'Base not found' }, { status: 404 });
  let base = null;
  if (typeof body?.name === 'string' && body.name.trim()) base = await store.renameBase(id, body.name.trim());
  if (body?.parent !== undefined) {
    const newParent = body.parent === null ? null : String(body.parent);
    if (newParent !== null) {
      // a base can't be nested into itself or its own branch — otherwise
      // the tree becomes cyclic, and /api/records walking the descendants goes
      // into infinite recursion (RangeError on every read of such a base)
      //
      // the cycle check must see EVERY base, not just the ones visible to the
      // mover: a link through someone else's private base is invisible here but
      // very much real in the tree, and the resulting cycle makes /api/records
      // recurse until RangeError on every read of that branch
      const all = await store.listAllBases();
      const kids = new Map<string, string[]>();
      for (const b of all) {
        if (!b.parent) continue;
        kids.set(b.parent, [...(kids.get(b.parent) ?? []), b.id]);
      }
      const descendants = new Set<string>();
      const walk = (nodeId: string) => {
        for (const child of kids.get(nodeId) ?? []) {
          descendants.add(child);
          walk(child);
        }
      };
      walk(id);
      if (newParent === id || descendants.has(newParent)) {
        return Response.json({ error: 'A base cannot be nested inside itself or its own branch' }, { status: 400 });
      }
    }
    base = await store.moveBase(id, newParent);
  }
  if (!base) return Response.json({ error: 'Base not found' }, { status: 404 });
  return Response.json({ base });
}

// delete / restore a custom base (recycle bin)
export async function DELETE(request: Request): Promise<Response> {
  let body: { id?: unknown; restore?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Malformed request' }, { status: 400 }); }
  const id = String(body?.id ?? '');
  if (!id || BUILTIN_IDS.has(id)) return Response.json({ error: 'This base cannot be deleted' }, { status: 400 });
  const store = getCustomStore();
  const me = await currentEmail();
  if (body?.restore === true) {
    // only an accessible base from your own bin can be restored
    const bin = await store.listBin();
    const found = bin.bases.find((b) => b.id === id);
    if (!found || !canAccessBase(found, me)) return Response.json({ error: 'Base not found' }, { status: 404 });
    const okr = await store.restoreBase(id);
    return Response.json({ restored: okr ? id : null });
  }
  // only an accessible base can be deleted, not someone else's private one
  const target = await store.getBase(id);
  if (!target || !canAccessBase(target, me)) return Response.json({ error: 'Base not found' }, { status: 404 });
  const okd = await store.softDeleteBase(id);
  return Response.json({ deleted: okd ? id : null });
}
