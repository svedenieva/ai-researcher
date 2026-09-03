// ТР-ПИ-06: результат прогона как набор обязательных секций. Что выводимо из
// строк — собираем (первоисточники, таблица «цитата—источник», части
// исследования); остальные секции ищем по колонкам с подходящими названиями
// (выводы / альтернативные точки зрения / особое мнение / оценка по тезису), а
// если нет — секция всё равно присутствует и помечается пустой. Чистая функция.
import type { ColumnDef } from '../datasource/types';
import { extractRow } from './eval';

export interface ResultSection {
  title: string;
  filled: boolean;
  /** markdown-тело секции (пустая строка, если !filled) */
  body: string;
}

export const EMPTY_MARK = '— пусто —';

const RE = {
  conclusions: /вывод|виснов|conclus|итог|summary/i,
  alternatives: /альтернатив|alternativ|инаяточка|otherview/i,
  dissent: /особое\s*мнени|особлив|dissent|contrarian|возражени/i,
  assessment: /оценк|оцінк|assessment|score|рейтинг|вердикт|verdict/i,
  link: /источник|source|url|ссылк|посилан|link/i,
};

function clean(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

// собрать непустые значения колонок, чьи метки/ключи подходят под шаблон
function gather(columns: Array<Pick<ColumnDef, 'key' | 'label'>>, rows: Array<Record<string, unknown>>, re: RegExp): string[] {
  const cols = columns.filter((c) => !c.key.startsWith('__') && (re.test(c.label) || re.test(c.key)));
  const out: string[] = [];
  for (const row of rows) {
    for (const c of cols) {
      const v = clean(row[c.key]);
      if (v) out.push(v);
    }
  }
  return [...new Set(out)];
}

function bullets(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n');
}

export function composeSections(
  columns: Array<Pick<ColumnDef, 'key' | 'label'>>,
  rows: Array<Record<string, unknown>>,
): ResultSection[] {
  const section = (title: string, items: string[]): ResultSection =>
    items.length ? { title, filled: true, body: bullets(items) } : { title, filled: false, body: '' };

  // выводы / альтернативные / особое мнение / оценка — из подходящих колонок
  const conclusions = section('Выводы', gather(columns, rows, RE.conclusions));
  const alternatives = section('Альтернативные точки зрения', gather(columns, rows, RE.alternatives));
  const dissent = section('Особое мнение', gather(columns, rows, RE.dissent));
  const assessment = section('Оценка по тезисам', gather(columns, rows, RE.assessment));

  // первоисточники — уникальные ссылки из строк
  const links = new Set<string>();
  for (const row of rows) {
    const { link } = extractRow(row);
    if (link) links.add(link);
    for (const c of columns) {
      if (c.key.startsWith('__') || !RE.link.test(c.label + ' ' + c.key)) continue;
      for (const m of clean(row[c.key]).match(/https?:\/\/\S+/g) ?? []) links.add(m);
    }
  }
  const primarySources = section('Первоисточники', [...links]);

  // части исследования — распределение строк по первой select-колонке (аспект)
  const aspectCol = columns.find((c) => !c.key.startsWith('__') && (c as ColumnDef).type === 'select');
  const parts: string[] = [];
  if (aspectCol) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const v = clean(row[aspectCol.key]);
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (const [name, n] of counts) parts.push(`${name} (${n})`);
  }
  const researchParts = section('Части исследования', parts);

  // таблица «цитата — источник»
  const table: string[] = [];
  for (const row of rows) {
    const { name, quote, link } = extractRow(row);
    if (!quote) continue;
    const src = link ? `[ссылка](${link})` : '';
    table.push(`| ${clean(name) || '—'} | ${clean(quote)} | ${src} |`);
  }
  const quoteTable: ResultSection = table.length
    ? { title: 'Таблица «цитата — источник»', filled: true, body: ['| Тезис | Цитата | Источник |', '| --- | --- | --- |', ...table].join('\n') }
    : { title: 'Таблица «цитата — источник»', filled: false, body: '' };

  // порядок — как в ТР-ПИ-06
  return [conclusions, primarySources, researchParts, alternatives, dissent, quoteTable, assessment];
}

/** секции как markdown-блок; пустые помечаются EMPTY_MARK (§ приёмка ТР-ПИ-06). */
export function sectionsMarkdown(sections: ResultSection[]): string {
  const out: string[] = [];
  for (const s of sections) {
    out.push(`## ${s.title}`, '');
    out.push(s.filled ? s.body : `_${EMPTY_MARK}_`, '');
  }
  return out.join('\n');
}
