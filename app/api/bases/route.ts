import { BASES } from '@/lib/datasource/bases';
import { getCustomStore, type CustomBase } from '@/lib/datasource/customStore';
import type { ColumnDef } from '@/lib/datasource/types';

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
    const rows = await getCustomStore().listBases();
    custom = rows.map((b) => ({ id: b.id, name: b.name, tone: b.tone, builtin: false, parent: b.parent ?? null }));
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
    const base = await store.createBase({ name, columns, tone, parent });
    const rows = mapRows(columns, body?.rows);
    const imported = rows.length ? await store.addRecords(base.id, rows) : 0;
    return Response.json({ base, imported });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка создания базы';
    return Response.json({ error: msg }, { status: 500 });
  }
}
