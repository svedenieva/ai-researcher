// A research base as a readable Markdown report — for sharing the result
// outside the app. Same shape as a research row: each entry is a heading (the
// name), the verbatim quote as a blockquote, its aspect columns as bullets, and
// a link to the primary source. Pure and testable; the route just serves it.

import type { ColumnDef } from '../datasource/types';
import { extractRow } from './eval';
import { CHECK_COLUMN } from './links';
import { composeSections, sectionsMarkdown } from './result-sections';

// columns whose values are already rendered specially (name/quote/link), so they
// aren't repeated in the per-row bullet list
const QUOTE_KEYS = new Set(['цитата', 'quote']);
const LINK_KEYS = new Set(['источники', 'источник', 'sources', 'source', 'url', 'ссылка', 'посилання']);

function clean(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

export function toMarkdown(
  baseName: string,
  columns: Array<Pick<ColumnDef, 'key' | 'label'>>,
  rows: Array<Record<string, unknown>>,
): string {
  const nameKey = columns.find((c) => !c.key.startsWith('__'))?.key;
  const aspectCols = columns.filter(
    (c) =>
      !c.key.startsWith('__') &&
      c.key !== nameKey &&
      c.key !== CHECK_COLUMN.key &&
      !QUOTE_KEYS.has(c.key.toLowerCase()) &&
      !LINK_KEYS.has(c.key.toLowerCase()),
  );

  const out: string[] = [`# ${baseName}`, '', `_Записей: ${rows.length}_`, ''];

  // ТР-ПИ-06: обязательные секции результата прогона (пустые помечены)
  out.push(sectionsMarkdown(composeSections(columns, rows)), '## Записи', '');

  for (const row of rows) {
    const { name, quote, link } = extractRow(row);
    out.push(`## ${name || '—'}`);

    if (quote) out.push('', `> ${clean(quote)}`);

    const bullets = aspectCols
      .map((c) => ({ label: c.label, val: clean(row[c.key]) }))
      .filter((x) => x.val)
      .map((x) => `- **${x.label}:** ${x.val}`);
    if (bullets.length) out.push('', ...bullets);

    if (link) out.push('', `[Источник](${link})`);
    out.push('', '---', '');
  }

  return out.join('\n');
}
