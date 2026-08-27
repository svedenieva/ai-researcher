import { getDataSource } from '@/lib/datasource';
import { JsonDataSource } from '@/lib/datasource/json';
import { BASES, baseById } from '@/lib/datasource/bases';
import { getCustomStore, canAccessBase } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
import { MODE_KEY, MODE_RESEARCH, MODE_REFERENCE, recordMode } from '@/lib/mode';
import { descendantsOf } from '@/lib/datasource/tree';
import type { ListParams } from '@/lib/datasource/types';
import { isSafeUrlValue } from '@/lib/safe-url';
import { checkPayload } from '@/lib/limits';
import { publicError } from '@/lib/errors';
import { sharingEnabled } from '@/lib/research/share';

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

// A row payload must be a plain object — not an array, string, number or null.
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// A url-typed cell may only carry a scheme the browser won't execute.
function badUrlCell(columns: { key: string; type: string }[], data: Record<string, unknown>): string | null {
  for (const col of columns) {
    if (col.type !== 'url') continue;
    if (!isSafeUrlValue(data[col.key])) return col.key;
  }
  return null;
}

function readParams(url: URL): { params: ListParams; q: string | null } {
  const params: ListParams = {};
  const sortKey = url.searchParams.get('sortKey');
  const sortDir = url.searchParams.get('sortDir');
  if (sortKey) params.sort = { key: sortKey, dir: sortDir === 'desc' ? 'desc' : 'asc' };

  const filters: Record<string, string> = {};
  for (const raw of url.searchParams.getAll('f')) {
    const i = raw.indexOf(':');
    if (i > 0) filters[raw.slice(0, i)] = raw.slice(i + 1);
  }
  if (Object.keys(filters).length) params.filters = filters;

  // single filter from the first API version: the frontend has long sent
  // f=key:value, but the parameter lingers in the docs and external links —
  // without parsing it, the route would silently return an unfiltered list
  const filterKey = url.searchParams.get('filterKey');
  const filterValue = url.searchParams.get('filterValue');
  if (filterKey && filterValue) params.filter = { key: filterKey, value: filterValue };

  const q = url.searchParams.get('q');
  if (q) params.search = q;
  return { params, q };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const baseId = url.searchParams.get('base');
  const { params, q } = readParams(url);

  // A section shows its own records AND everything below it in the tree —
  // the level selector works like a slice: the higher the level, the wider the cut.
  const SOURCE_COL = {
    key: '__source',
    label: 'З бази',
    type: 'select' as const,
    sortable: true,
    filterable: true,
  };

  // ── custom base (created from the UI) ─────────────────────────
  //
  // Asking for a base and getting a DIFFERENT one is never an acceptable
  // answer. This branch used to swallow every failure and fall through to the
  // built-in catalog, so a missing base, a revoked one or a Supabase blip all
  // rendered 400+ catalog rows under your base's name — and the research page,
  // which polls this route waiting for its run base to fill up, read that as
  // "the research is done" and showed the catalog as the result.
  if (baseId && !BUILTIN_IDS.has(baseId)) {
    const store = getCustomStore();
    const me = await currentEmail();

    let custom;
    try {
      custom = await store.getBase(baseId);
    } catch (e) {
      console.error('custom base read failed:', e);
      return Response.json({ error: 'Could not read the base' }, { status: 500 });
    }

    // Missing and forbidden answer identically on purpose: confirming that a
    // guessed id names a real private base is itself a leak.
    if (!custom || !canAccessBase(custom, me)) {
      return Response.json({ error: 'Base not found, or no access' }, { status: 404 });
    }

    try {
      {
        // descendants are taken only among ACCESSIBLE bases: another person's
        // private base nested inside a shared one won't appear in the slice
        const all = await store.listBases(me);
        const descendants = descendantsOf(all, baseId);

        const nameById = new Map(all.map((b) => [b.id, b.name]));
        // the mode is normalised AFTER the spread so rows written before the
        // rename show the current label instead of the legacy one
        let rows = (await store.listRecords(baseId)).map((r) => ({ ...r, [MODE_KEY]: recordMode(r), __source: custom.name }));
        for (const id of descendants) {
          const sub = await store.listRecords(id);
          rows = rows.concat(sub.map((r) => ({ ...r, [MODE_KEY]: recordMode(r), __source: nameById.get(id) ?? id })));
        }

        // research/reference mode filter: the top switch narrows to one kind
        const mode = url.searchParams.get('mode');
        if (mode === MODE_RESEARCH || mode === MODE_REFERENCE) {
          rows = rows.filter((r) => recordMode(r) === mode);
        }

        const cols = descendants.length ? [...custom.columns, SOURCE_COL] : custom.columns;
        const ds = new JsonDataSource(rows, cols);
        const [records, facets] = await Promise.all([ds.list(params), ds.facets()]);
        const total = q || params.filters ? (await ds.list()).length : records.length;
        return Response.json({ columns: cols, records, facets, total, base: baseId, custom: true, sharing: sharingEnabled() });
      }
    } catch (e) {
      console.error('custom base read failed:', e);
      return Response.json({ error: 'Could not read the base' }, { status: 500 });
    }
  }

  // ── built-in base (product catalog slice) ────────────────────
  const base = baseById(baseId);
  if (base.section) params.filters = { ...(params.filters ?? {}), section: base.section };

  const ds = getDataSource();
  const [allColumns, records, allFacets] = await Promise.all([
    ds.columns(),
    ds.list(params),
    ds.facets(),
  ]);

  let columns = allColumns;
  let facets = allFacets;
  if (base.section) {
    columns = allColumns.filter((c) => c.key !== 'section');
    const { section: _section, ...rest } = allFacets;
    facets = rest;
  }

  const baseParams: ListParams | undefined = base.section ? { filters: { section: base.section } } : undefined;
  const userNarrowed = Boolean(
    params.filter || q || (params.filters && Object.keys(params.filters).some((k) => k !== 'section')),
  );
  let total = userNarrowed ? (await ds.list(baseParams)).length : records.length;

  // mix in records from custom bases nested under this section
  let merged = records;
  // A failure here isn't fatal — the catalog itself is valid — but the table
  // silently loses every nested row, and nothing told the user their data was
  // missing. The warning travels with the response so the UI can say so.
  let warning: string | undefined;
  try {
    const store = getCustomStore();
    // mix into the built-in section only bases ACCESSIBLE to the user
    const me = await currentEmail();
    const all = await store.listBases(me);
    const descendants = descendantsOf(all, base.id);

    if (descendants.length) {
      const nameById = new Map(all.map((b) => [b.id, b.name]));
      merged = records.map((r) => ({ ...r, __source: base.name }));
      for (const id of descendants) {
        const sub = await store.listRecords(id);
        // tag with the owning base id: these are custom rows (UUID ids) merged
        // into the catalog view, and opening one must go to its base, not to
        // /product/<id> (which only knows catalog slugs and would 404)
        merged = merged.concat(sub.map((r) => ({ ...r, __source: nameById.get(id) ?? id, __baseId: id })));
      }
      columns = [...columns, SOURCE_COL];
      facets = { ...facets, __source: [...new Set(merged.map((r) => String(r.__source ?? '')))].filter(Boolean) };
      total = merged.length;
    }
  } catch (e) {
    console.error('nested bases merge failed:', e);
    warning = 'Nested bases failed to load - showing the catalog only';
  }

  return Response.json({ columns, records: merged, facets, total, base: base.id, custom: false, warning });
}

// add a row to a custom base
export async function POST(request: Request): Promise<Response> {
  let body: { base?: unknown; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed request' }, { status: 400 });
  }
  const baseId = String(body?.base ?? '');
  if (!baseId || BUILTIN_IDS.has(baseId)) {
    return Response.json({ error: 'Rows cannot be added to this base' }, { status: 400 });
  }
  // `data` must be a plain object keyed by column. An array (typeof 'object')
  // would be stored as a row with keys "0","1",…; a string/number silently
  // became {} and added an empty row. Reject the wrong type outright.
  if (!isPlainObject(body?.data)) {
    return Response.json({ error: 'Row data must be an object' }, { status: 400 });
  }
  const data = body.data as Record<string, unknown>;
  const tooBig = checkPayload(data);
  if (tooBig) return Response.json({ error: tooBig }, { status: 400 });

  try {
    const store = getCustomStore();
    const base = await store.getBase(baseId);
    const me = await currentEmail();
    // writing is allowed to own/shared/ownerless bases, not someone else's private one
    if (!base || !canAccessBase(base, me)) return Response.json({ error: 'Base not found' }, { status: 404 });
    if (badUrlCell(base.columns, data)) {
      return Response.json({ error: 'A url column accepts only http, https, mailto or tel' }, { status: 400 });
    }
    const record = await store.addRecord(baseId, data);
    return Response.json({ record });
  } catch (e) {
    return Response.json({ error: publicError(e, 'Could not add the row', 'addRecord failed') }, { status: 500 });
  }
}

// update a single row cell in a custom base
export async function PATCH(request: Request): Promise<Response> {
  let body: { base?: unknown; id?: unknown; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed request' }, { status: 400 });
  }
  const baseId = String(body?.base ?? '');
  const id = String(body?.id ?? '');
  if (!baseId || BUILTIN_IDS.has(baseId) || !id) {
    return Response.json({ error: 'This row cannot be edited' }, { status: 400 });
  }
  const patch = body?.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : {};
  const tooBig = checkPayload(patch);
  if (tooBig) return Response.json({ error: tooBig }, { status: 400 });

  try {
    const store = getCustomStore();
    const base = await store.getBase(baseId);
    const me = await currentEmail();
    if (!base || !canAccessBase(base, me)) return Response.json({ error: 'Base not found' }, { status: 404 });
    if (badUrlCell(base.columns, patch)) {
      return Response.json({ error: 'A url column accepts only http, https, mailto or tel' }, { status: 400 });
    }
    const record = await store.updateRecord(baseId, id, patch);
    if (!record) return Response.json({ error: 'Row not found' }, { status: 404 });
    return Response.json({ record });
  } catch (e) {
    return Response.json({ error: publicError(e, 'Could not update the row', 'updateRecord failed') }, { status: 500 });
  }
}

// delete/restore rows of a custom base (recycle bin)
export async function DELETE(request: Request): Promise<Response> {
  let body: { base?: unknown; ids?: unknown; restore?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Malformed request' }, { status: 400 }); }
  const baseId = String(body?.base ?? '');
  const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  if (!baseId || BUILTIN_IDS.has(baseId) || !ids.length) {
    return Response.json({ error: 'These rows cannot be deleted' }, { status: 400 });
  }
  const store = getCustomStore();
  const base = await store.getBase(baseId);
  const me = await currentEmail();
  if (!base || !canAccessBase(base, me)) return Response.json({ error: 'Base not found' }, { status: 404 });
  if (body?.restore === true) {
    const restored = await store.restoreRecords(baseId, ids);
    return Response.json({ restored });
  }
  const deleted = await store.softDeleteRecords(baseId, ids);
  return Response.json({ deleted });
}
