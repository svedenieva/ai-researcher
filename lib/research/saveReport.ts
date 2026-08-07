import type { ColumnDef } from '@/lib/datasource/types';
import type { Finding } from './types';

export const REPORT_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Название', type: 'text', sortable: true },
  { key: 'what', label: 'Что делает', type: 'text', sortable: true },
  { key: 'url', label: 'Ссылка', type: 'url' },
  { key: 'subtopic', label: 'Подтема', type: 'select', sortable: true, filterable: true },
  { key: 'status', label: 'Статус', type: 'select', sortable: true, filterable: true },
  { key: 'sources', label: 'Источники', type: 'long-text' },
];

export interface ReportRow {
  name: string; what: string; url: string; subtopic: string; status: string; sources: string;
}

// найденные компании по всем подтемам → строки, дедуп по имени (в нижнем
// регистре). Одна компания из разных подтем сливается: подтемы и источники
// объединяются; «в каталоге» приоритетнее «новое».
export function reportToRows(report: Finding[]): ReportRow[] {
  const acc = new Map<string, { row: ReportRow; subs: Set<string>; srcs: Set<string> }>();
  for (const f of report ?? []) {
    const subSources = (f.sources ?? []).map((s) => s.url).filter((u): u is string => Boolean(u));
    for (const c of f.relevant ?? []) {
      const name = String(c?.name ?? '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const status = String(c.id ?? '').startsWith('web:') ? 'новое' : 'в каталоге';
      let e = acc.get(key);
      if (!e) {
        e = { row: { name, what: c.vertical ?? '', url: c.url ?? '', subtopic: '', status, sources: '' }, subs: new Set(), srcs: new Set() };
        acc.set(key, e);
      } else {
        if (!e.row.what && c.vertical) e.row.what = c.vertical;
        if (!e.row.url && c.url) e.row.url = c.url;
        if (status === 'в каталоге') e.row.status = 'в каталоге';
      }
      e.subs.add(f.subtopic);
      for (const u of subSources) e.srcs.add(u);
    }
  }
  return [...acc.values()].map((e) => ({ ...e.row, subtopic: [...e.subs].join(', '), sources: [...e.srcs].join('\n') }));
}
