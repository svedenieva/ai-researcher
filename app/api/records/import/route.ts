import { getCustomStore, canAccessBase } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
import { BASES } from '@/lib/datasource/bases';
import { parseTable } from '@/lib/parseTable';
import { mapImportRows } from '@/lib/importTable';
import { publicError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

// Re-import a .md / .csv / .tsv table back INTO an existing base — the other
// half of the round-trip: export a base, edit the file, import it back and the
// SAME base is updated (its rows replaced), keeping its schema/types. Headers are
// matched to the base's columns by label; unmatched headers are reported, not
// applied. Full replace (the file is authoritative), so it mirrors the export.
//   POST { base: string, text: string }  ->  { replaced, added, matched, unmatched }
export async function POST(request: Request): Promise<Response> {
  let body: { base?: unknown; text?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Malformed request' }, { status: 400 }); }

  const baseId = String(body?.base ?? '');
  const text = String(body?.text ?? '');
  if (!baseId || BUILTIN_IDS.has(baseId)) {
    return Response.json({ error: 'Only your own bases can be imported into' }, { status: 400 });
  }
  if (!text.trim()) return Response.json({ error: 'Empty file' }, { status: 400 });

  const store = getCustomStore();
  const me = await currentEmail();
  const base = await store.getBase(baseId);
  if (!base || !canAccessBase(base, me)) {
    return Response.json({ error: 'Base not found, or no access' }, { status: 404 });
  }

  const { headers, rows } = parseTable(text);
  if (!headers.length) return Response.json({ error: 'No table found in the file' }, { status: 400 });

  const { rows: mapped, matched, unmatched } = mapImportRows(base.columns, headers, rows);
  if (!matched.length) {
    return Response.json(
      { error: 'Жоден стовпець файлу не збігся з базою — перевірте заголовки', unmatched },
      { status: 422 },
    );
  }

  try {
    // full replace: the imported file is the base's new content (round-trip).
    const existing = await store.listRecords(baseId);
    const replaced = existing.length
      ? await store.softDeleteRecords(baseId, existing.map((r) => String(r.id)))
      : 0;
    const now = new Date().toISOString();
    const stamped = mapped.map((r) => ({ ...r, __created: now, __updated: now }));
    const added = stamped.length ? await store.addRecords(baseId, stamped) : 0;
    return Response.json({ replaced, added, matched, unmatched });
  } catch (e) {
    return Response.json({ error: publicError(e, 'Не вдалося імпортувати', 'import failed') }, { status: 500 });
  }
}
