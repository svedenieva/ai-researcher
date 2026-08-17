import { getCustomStore, canAccessBase } from '@/lib/datasource/customStore';
import { BASES } from '@/lib/datasource/bases';
import { currentEmail } from '@/lib/current-user';
import { reportToRows, REPORT_COLUMNS, type ReportRow } from '@/lib/research/saveReport';
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
  const me = await currentEmail();

  try {
    if (target?.mode === 'new') {
      const name = String(target?.name ?? '').trim();
      if (!name) return Response.json({ error: 'Нужно название базы' }, { status: 400 });
      // new base — private, owned by the current user
      const base = await store.createBase({ name, columns: REPORT_COLUMNS, owner: me });
      const added = await store.addRecords(base.id, rows as unknown as Record<string, unknown>[]);
      return Response.json({ baseId: base.id, baseName: base.name, added, skipped: 0 });
    }

    if (target?.mode === 'existing') {
      const baseId = String(target?.baseId ?? '');
      if (!baseId || BUILTIN_IDS.has(baseId)) return Response.json({ error: 'В эту базу нельзя сохранять' }, { status: 400 });
      let base = await store.getBase(baseId);
      // saving is allowed only to an accessible base, not someone else's private one
      if (!base || !canAccessBase(base, me)) return Response.json({ error: 'База не найдена' }, { status: 404 });

      // Map REPORT_COLUMNS onto the target base's columns. Bases created by our
      // own save route (mode: 'new') carry English keys 1-to-1 — but bases
      // created from the app/MCP get their key as a slug of the Russian label
      // (label «Название» → key «название»). We look up a column by key OR by
      // label (case-insensitively); if it's missing we create it, so nothing is
      // lost and we don't write into non-existent fields.
      const keyMap: Record<string, string> = {};
      for (const rc of REPORT_COLUMNS) {
        let col = base.columns.find(
          (c) => c.key === rc.key || c.label.trim().toLowerCase() === rc.label.toLowerCase(),
        );
        if (!col) {
          base = await store.addColumn(baseId, { label: rc.label, type: rc.type, filterable: rc.filterable });
          if (!base) return Response.json({ error: 'Не удалось добавить колонку' }, { status: 500 });
          col = base.columns.find((c) => c.label.trim().toLowerCase() === rc.label.toLowerCase());
        }
        keyMap[rc.key] = col!.key;
      }

      const nameKey = keyMap.name;
      const have = new Set(
        (await store.listRecords(baseId)).map((r) => String(r[nameKey] ?? '').toLowerCase()),
      );
      const fresh = rows.filter((r) => !have.has(r.name.toLowerCase()));
      const mapped = fresh.map((r) =>
        Object.fromEntries(REPORT_COLUMNS.map((rc) => [keyMap[rc.key], r[rc.key as keyof ReportRow]])),
      );
      const added = mapped.length ? await store.addRecords(baseId, mapped as Record<string, unknown>[]) : 0;
      return Response.json({ baseId, baseName: base.name, added, skipped: rows.length - fresh.length });
    }

    return Response.json({ error: 'Не указана цель сохранения' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка сохранения';
    return Response.json({ error: msg }, { status: 500 });
  }
}
