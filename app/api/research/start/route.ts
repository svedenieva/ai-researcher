import { getCustomStore } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
import { researchDeeplinks } from '@/lib/research/deeplink';
import type { ColumnDef } from '@/lib/datasource/types';

// Minimal seed for a research run base: just a name + a source column. Claude
// adds the columns that actually fit the question itself (via add_column), per
// the instruction — so any question gets a topic-shaped table, not a
// company-shaped one.
const RUN_SEED_COLUMNS: ColumnDef[] = [
  { key: 'название', label: 'Название', type: 'text', sortable: true },
  { key: 'источники', label: 'Источники', type: 'long-text' },
];

export const dynamic = 'force-dynamic';

// Start a research run (Variant C): create a private "run base" owned by the
// current user (their Claude will later write the result into it via the
// connector) and return a deeplink that opens the user's own Claude with a
// ready-made prompt.
export async function POST(request: Request): Promise<Response> {
  let body: { prompt?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Некорректный запрос' }, { status: 400 }); }
  const topic = String(body?.prompt ?? '').trim();
  if (!topic) return Response.json({ error: 'Пустой запрос' }, { status: 400 });

  const me = await currentEmail();
  const store = getCustomStore();

  // short date in the name so runs don't collide; the slug adds a numeric
  // suffix on any remaining clash
  const d = new Date();
  const stamp = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  const name = `Исследование: ${topic.slice(0, 48)} (${stamp})`;

  try {
    const base = await store.createBase({ name, columns: RUN_SEED_COLUMNS, owner: me });
    const links = researchDeeplinks(topic, base.id);
    return Response.json({
      baseId: base.id,
      baseName: base.name,
      web: links.web,
      desktop: links.desktop,
      instruction: links.instruction,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Не удалось создать базу запуска';
    return Response.json({ error: msg }, { status: 500 });
  }
}
