import { getCustomStore } from '@/lib/datasource/customStore';
import { currentEmail } from '@/lib/current-user';
import { REPORT_COLUMNS } from '@/lib/research/saveReport';
import { researchDeeplinks } from '@/lib/research/deeplink';

export const dynamic = 'force-dynamic';

// Старт исследования по Варианту C: заводим приватную «базу запуска» под текущего
// пользователя (Claude потом запишет в неё результат своим коннектором) и отдаём
// deeplink, который откроет собственный Claude пользователя с готовым промптом.
export async function POST(request: Request): Promise<Response> {
  let body: { prompt?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Некорректный запрос' }, { status: 400 }); }
  const topic = String(body?.prompt ?? '').trim();
  if (!topic) return Response.json({ error: 'Пустой запрос' }, { status: 400 });

  const me = await currentEmail();
  const store = getCustomStore();

  // короткая дата в названии — чтобы прогоны не сливались; slug сам добьёт
  // уникальность суффиксом при совпадении
  const d = new Date();
  const stamp = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  const name = `Исследование: ${topic.slice(0, 48)} (${stamp})`;

  try {
    const base = await store.createBase({ name, columns: REPORT_COLUMNS, owner: me });
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
