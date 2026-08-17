import { getCustomStore, canAccessBase } from '@/lib/datasource/customStore';
import { BASES } from '@/lib/datasource/bases';
import { currentEmail } from '@/lib/current-user';
import type { ColumnPatch, NewColumn } from '@/lib/datasource/customStore';

// Живое управление колонками пользовательской базы: добавить, переименовать,
// сменить тип, удалить, переставить. Встроенные базы (срезы каталога) — только
// для чтения, их структуру менять нельзя.
const BUILTIN = new Set(BASES.map((b) => b.id));

export async function POST(request: Request): Promise<Response> {
  let body: {
    base?: unknown; action?: unknown;
    key?: unknown; column?: unknown; patch?: unknown; keys?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const baseId = String(body?.base ?? '');
  const action = String(body?.action ?? '');
  if (!baseId) return Response.json({ error: 'Не указана база' }, { status: 400 });
  if (BUILTIN.has(baseId)) {
    return Response.json({ error: 'Встроенные базы менять нельзя' }, { status: 400 });
  }

  try {
    const store = getCustomStore();
    // менять структуру можно только у доступной базы, не у чужой приватной
    const target = await store.getBase(baseId);
    const me = await currentEmail();
    if (!target || !canAccessBase(target, me)) return Response.json({ error: 'База не найдена' }, { status: 404 });
    let base;
    switch (action) {
      case 'add':
        base = await store.addColumn(baseId, (body.column ?? {}) as NewColumn);
        break;
      case 'update':
        base = await store.updateColumn(baseId, String(body.key ?? ''), (body.patch ?? {}) as ColumnPatch);
        break;
      case 'delete':
        base = await store.deleteColumn(baseId, String(body.key ?? ''));
        break;
      case 'reorder':
        base = await store.reorderColumns(
          baseId,
          Array.isArray(body.keys) ? body.keys.map(String) : [],
        );
        break;
      default:
        return Response.json({ error: `Неизвестное действие: ${action}` }, { status: 400 });
    }
    if (!base) return Response.json({ error: 'База не найдена' }, { status: 404 });
    return Response.json({ base });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка изменения колонок';
    return Response.json({ error: msg }, { status: 500 });
  }
}
