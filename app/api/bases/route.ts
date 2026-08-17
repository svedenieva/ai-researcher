import { BASES } from '@/lib/datasource/bases';
import { currentEmail } from '@/lib/current-user';
import { getCustomStore, canAccessBase, type CustomBase } from '@/lib/datasource/customStore';
import type { ColumnDef } from '@/lib/datasource/types';

// GET не принимает request, поэтому Next по умолчанию отдал бы снимок,
// снятый на сборке — список баз «замерзал» бы до следующего деплоя.
// Базы меняются в рантайме (создаются из UI), поэтому роут динамический.
export const dynamic = 'force-dynamic';

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

interface BaseDTO {
  id: string;
  name: string;
  tone: string;
  builtin: boolean;
  parent: string | null;
}

// список всех баз для переключателя: сначала встроенные (срезы каталога),
// потом пользовательские (из БД). parent → дерево в пикере.
export async function GET(): Promise<Response> {
  const builtin: BaseDTO[] = BASES.map((b) => ({ id: b.id, name: b.name, tone: b.tone, builtin: true, parent: null }));
  let custom: BaseDTO[] = [];
  try {
    // Приватная модель: человек видит свои базы, общие и ничейные (командную
    // базу знаний). Чужие приватные базы в список не попадают.
    const me = await currentEmail();
    const rows = await getCustomStore().listBases(me);
    const visible = new Set([...rows.map((b) => b.id), ...BASES.map((b) => b.id)]);
    custom = rows
      // база без существующего родителя всплывает на верхний уровень,
      // иначе потеряется в дереве
      .map((b) => ({
        id: b.id,
        name: b.name,
        tone: b.tone,
        builtin: false,
        parent: b.parent && visible.has(b.parent) ? b.parent : null,
      }));
  } catch (e) {
    // если пользовательские базы недоступны (нет таблиц) — показываем хотя бы встроенные
    console.error('listBases failed:', e);
  }
  return Response.json({ bases: [...builtin, ...custom] });
}

// нормализуем колонки из формы в валидные ColumnDef
function normalizeColumns(input: unknown): ColumnDef[] {
  if (!Array.isArray(input)) return [];
  const cols: ColumnDef[] = [];
  const used = new Set<string>();
  for (const raw of input) {
    const label = String((raw as { label?: unknown })?.label ?? '').trim();
    if (!label) continue;
    let key = label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/(^_|_$)/g, '') || `col${cols.length}`;
    while (used.has(key)) key = `${key}_`;
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

// позиционные строки импорта (row[i] ↔ columns[i]) → объекты по ключам колонок
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
    return Response.json({ error: 'Некорректный запрос' }, { status: 400 });
  }
  const name = String(body?.name ?? '').trim();
  if (!name) return Response.json({ error: 'Нужно название базы' }, { status: 400 });

  const columns = normalizeColumns(body?.columns);
  if (!columns.length) return Response.json({ error: 'Добавьте хотя бы одну колонку' }, { status: 400 });

  const tone = body?.tone === 'teal' || body?.tone === 'blue' || body?.tone === 'amber' || body?.tone === 'sage'
    ? (body.tone as CustomBase['tone'])
    : undefined;
  const parent = typeof body?.parent === 'string' && body.parent ? body.parent : null;

  try {
    const store = getCustomStore();
    const owner = await currentEmail();
    const base = await store.createBase({ name, columns, tone, parent, owner });
    const rows = mapRows(columns, body?.rows);
    const imported = rows.length ? await store.addRecords(base.id, rows) : 0;
    return Response.json({ base, imported });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка создания базы';
    return Response.json({ error: msg }, { status: 500 });
  }
}

// переименовать / переместить пользовательскую базу
export async function PATCH(request: Request): Promise<Response> {
  let body: { id?: unknown; name?: unknown; parent?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Некорректный запрос' }, { status: 400 }); }
  const id = String(body?.id ?? '');
  if (!id || BUILTIN_IDS.has(id)) return Response.json({ error: 'Эту базу нельзя менять' }, { status: 400 });
  const store = getCustomStore();
  const me = await currentEmail();
  // менять можно только доступную базу (свою/общую/ничейную), не чужую приватную
  const target = await store.getBase(id);
  if (!target || !canAccessBase(target, me)) return Response.json({ error: 'База не найдена' }, { status: 404 });
  let base = null;
  if (typeof body?.name === 'string' && body.name.trim()) base = await store.renameBase(id, body.name.trim());
  if (body?.parent !== undefined) {
    const newParent = body.parent === null ? null : String(body.parent);
    if (newParent !== null) {
      // нельзя вложить базу в саму себя или в собственную ветку — иначе
      // дерево зацикливается, и /api/records при обходе потомков уходит
      // в бесконечную рекурсию (RangeError на каждом чтении такой базы)
      const all = await store.listBases(me);
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
        return Response.json({ error: 'Нельзя вложить базу в саму себя или в свою же ветку' }, { status: 400 });
      }
    }
    base = await store.moveBase(id, newParent);
  }
  if (!base) return Response.json({ error: 'База не найдена' }, { status: 404 });
  return Response.json({ base });
}

// удалить / восстановить пользовательскую базу (корзина)
export async function DELETE(request: Request): Promise<Response> {
  let body: { id?: unknown; restore?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Некорректный запрос' }, { status: 400 }); }
  const id = String(body?.id ?? '');
  if (!id || BUILTIN_IDS.has(id)) return Response.json({ error: 'Эту базу нельзя удалить' }, { status: 400 });
  const store = getCustomStore();
  const me = await currentEmail();
  if (body?.restore === true) {
    // восстановить можно только доступную базу из своей корзины
    const bin = await store.listBin();
    const found = bin.bases.find((b) => b.id === id);
    if (!found || !canAccessBase(found, me)) return Response.json({ error: 'База не найдена' }, { status: 404 });
    const okr = await store.restoreBase(id);
    return Response.json({ restored: okr ? id : null });
  }
  // удалять можно только доступную базу, не чужую приватную
  const target = await store.getBase(id);
  if (!target || !canAccessBase(target, me)) return Response.json({ error: 'База не найдена' }, { status: 404 });
  const okd = await store.softDeleteBase(id);
  return Response.json({ deleted: okd ? id : null });
}
