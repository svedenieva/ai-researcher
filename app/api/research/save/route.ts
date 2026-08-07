import { getCustomStore } from '@/lib/datasource/customStore';
import { BASES } from '@/lib/datasource/bases';
import { reportToRows, REPORT_COLUMNS } from '@/lib/research/saveReport';
import type { Finding } from '@/lib/research/types';

export const dynamic = 'force-dynamic';
const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

export async function POST(request: Request): Promise<Response> {
  let body: { report?: unknown; target?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Некорректный запрос' }, { status: 400 }); }

  const report = Array.isArray(body?.report) ? (body.report as Finding[]) : [];
  const rows = reportToRows(report);
  if (!rows.length) return Response.json({ error: 'В отчёте нет компаний для сохранения' }, { status: 400 });

  const target = body?.target as { mode?: unknown; name?: unknown; baseId?: unknown } | undefined;
  const store = getCustomStore();

  try {
    if (target?.mode === 'new') {
      const name = String(target?.name ?? '').trim();
      if (!name) return Response.json({ error: 'Нужно название базы' }, { status: 400 });
      const base = await store.createBase({ name, columns: REPORT_COLUMNS });
      const added = await store.addRecords(base.id, rows as unknown as Record<string, unknown>[]);
      return Response.json({ baseId: base.id, baseName: base.name, added, skipped: 0 });
    }

    if (target?.mode === 'existing') {
      const baseId = String(target?.baseId ?? '');
      if (!baseId || BUILTIN_IDS.has(baseId)) return Response.json({ error: 'В эту базу нельзя сохранять' }, { status: 400 });
      const base = await store.getBase(baseId);
      if (!base) return Response.json({ error: 'База не найдена' }, { status: 404 });
      const have = new Set((await store.listRecords(baseId)).map((r) => String(r.name ?? '').toLowerCase()));
      const keys = new Set(base.columns.map((c) => c.key));
      const fresh = rows.filter((r) => !have.has(r.name.toLowerCase()));
      // сохраняем только колонки, которые есть в целевой базе
      const mapped = fresh.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => keys.has(k))));
      const added = mapped.length ? await store.addRecords(baseId, mapped as Record<string, unknown>[]) : 0;
      return Response.json({ baseId, baseName: base.name, added, skipped: rows.length - fresh.length });
    }

    return Response.json({ error: 'Не указана цель сохранения' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка сохранения';
    return Response.json({ error: msg }, { status: 500 });
  }
}
