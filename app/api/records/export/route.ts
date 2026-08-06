import { GET as records } from '../route';
import { attachmentHeader, csvBody, rowsFor } from '@/lib/csv';
import { BASES, baseById } from '@/lib/datasource/bases';
import { getCustomStore } from '@/lib/datasource/customStore';
import type { ColumnDef } from '@/lib/datasource/types';

const BUILTIN_IDS = new Set(BASES.map((b) => b.id));

export const dynamic = 'force-dynamic';

// Выгрузка текущего среза в CSV.
//
// Принимает те же параметры, что и /api/records, и переиспользует его же
// обработчик — поэтому в файл попадает ровно то, что человек видит на экране,
// со всеми фильтрами и поиском. Это сознательно не так, как у Airtable, где
// зритель по ссылке жмёт Download CSV и получает записи БЕЗ своих фильтров:
// «the CSV downloaded will NOT take into account any of the filters applied».
// Расхождение между экраном и файлом — тихая ловушка, повторять её незачем.
export async function GET(request: Request): Promise<Response> {
  const res = await records(request);
  if (!res.ok) return res;

  const body = (await res.json()) as {
    columns: ColumnDef[];
    records: Array<Record<string, unknown>>;
  };

  // long-text в сетку не выводится, но в файл идёт: CSV — канал обмена
  // значениями, а не снимок экрана
  const columns = body.columns ?? [];
  const table = {
    headers: columns.map((c) => c.label),
    rows: rowsFor(columns, body.records ?? []),
  };

  // имя файла = название базы, чтобы в загрузках не копились records.csv
  const url = new URL(request.url);
  const baseId = url.searchParams.get('base');
  let name = baseById(baseId).name;
  if (baseId && !BUILTIN_IDS.has(baseId)) {
    try {
      name = (await getCustomStore().getBase(baseId))?.name ?? baseId;
    } catch {
      name = baseId;
    }
  }

  return new Response(csvBody(table), {
    headers: {
      // charset в типе — чтобы браузер не гадал; BOM внутри для Excel
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': attachmentHeader(name),
    },
  });
}
