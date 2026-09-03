import type { ColumnDef } from './datasource/types';
import { recordMode, MODE_REFERENCE } from './mode';
import { splitTags, TAGS_KEY } from './tags';

// §5.5 reading view: a base record shown as a calm, structured ARTICLE instead of
// a grid row. Field → section mapping follows §4.5 — the unit of a knowledge base
// is «описание (что и почему) · инструкции (кто и как) · чек-листы (что, зачем)» —
// so those three come first, in that order. Extra long-text becomes prose after
// them; sources, verbatim quotes, links and raw fields go to a SIDE pop-out (not
// inline, so the structure never shifts); select/tags become clickable badges.

export interface ArticleSection {
  key: string;
  heading: string;
  kind: 'markdown' | 'checklist';
  content: string;
  /** present for kind === 'checklist' */
  items?: string[];
}
export interface ArticleBadge { column: string; label: string; value: string }
export interface ArticleSidebar {
  sources: string[];
  quotes: string[];
  links: Array<{ label: string; url: string }>;
  raw: Array<{ label: string; value: string }>;
}
export interface Article {
  title: string;
  mode: 'reference' | 'draft';
  sections: ArticleSection[];
  sidebar: ArticleSidebar;
  badges: ArticleBadge[];
}

// §4.5 triad, by column label (ru / uk / en). Order here IS the section order.
const TRIAD = [
  new Set(['описание', 'опис', 'description']),
  new Set(['инструкции', 'инструкция', 'інструкції', 'instructions']),
  new Set(['чек-лист', 'чеклист', 'чек лист', 'чек-листи', 'checklist', 'check-list']),
];
const SOURCE = new Set(['источники', 'источник', 'джерела', 'джерело', 'sources', 'source']);
const QUOTE = new Set(['цитата', 'цитаты', 'цитати', 'quote', 'quotes']);
const URL_RE = /https?:\/\/[^\s"'<>)]+/gi;

const norm = (s: string) => s.trim().toLowerCase();
const triadIndex = (label: string) => TRIAD.findIndex((set) => set.has(norm(label)));

function checklistItems(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-*+]\s+/, '').replace(/^\[[ xX]\]\s+/, '').trim());
}

// ТР-БЗ-03: у каждого элемента базы знаний ОДИН И ТОТ ЖЕ набор разделов —
// «Введение», «Настройка», «Использование». В каждом: чек-лист (с копированием)
// и подробное описание. Незаполненный раздел присутствует и помечается пустым.
export interface KnowledgeSection {
  heading: string;
  description: string;
  items: string[];
  filled: boolean;
  /** ключи колонок, из которых собран раздел (чтобы не дублировать ниже) */
  usedKeys: string[];
}

const KB_SECTIONS: Array<{ heading: string; re: RegExp }> = [
  { heading: 'Введение', re: /введен|вступ|introduction|\bintro\b|описание|опис|overview|что это|про що/i },
  { heading: 'Настройка', re: /настрой|налашт|setup|install|установ|конфиг|config|подключ|під'?єдн/i },
  { heading: 'Использование', re: /использ|застосув|usage|\buse\b|применен|как польз|how to use|робота з|работа с/i },
];

function looksChecklist(text: string): boolean {
  return /(^|\n)\s*(?:[-*+]\s|\[[ xX]\]\s|\d+[.)]\s)/.test(text);
}

export function knowledgeSections(columns: ColumnDef[], record: Record<string, unknown>): KnowledgeSection[] {
  const firstKey = columns.find((c) => !c.key.startsWith('__'))?.key;
  return KB_SECTIONS.map(({ heading, re }) => {
    const descParts: string[] = [];
    const items: string[] = [];
    const usedKeys: string[] = [];
    for (const col of columns) {
      if (col.key.startsWith('__') || col.key === firstKey) continue;
      if (!re.test(`${col.label} ${col.key}`)) continue;
      const val = record[col.key] == null ? '' : String(record[col.key]).trim();
      if (!val) continue;
      usedKeys.push(col.key);
      const isCheck = TRIAD[2].has(norm(col.label)) || /чек|check/i.test(col.label) || looksChecklist(val);
      if (isCheck) items.push(...checklistItems(val));
      else descParts.push(val);
    }
    const description = descParts.join('\n\n');
    return { heading, description, items, filled: Boolean(description || items.length), usedKeys };
  });
}

export function buildArticle(columns: ColumnDef[], record: Record<string, unknown>): Article {
  const firstKey = columns.find((c) => !c.key.startsWith('__'))?.key;
  const title = String(record[firstKey ?? ''] ?? '').trim();
  const mode: Article['mode'] = recordMode(record) === MODE_REFERENCE ? 'reference' : 'draft';

  const triad: Array<{ index: number; section: ArticleSection }> = [];
  const others: ArticleSection[] = [];
  const sidebar: ArticleSidebar = { sources: [], quotes: [], links: [], raw: [] };
  const badges: ArticleBadge[] = [];

  for (const col of columns) {
    // system columns (__mode/__source/__pos/__baseId) never surface as content;
    // the «Теги» column (__tags) is the exception — it becomes wiki-style badges
    if ((col.key.startsWith('__') && col.key !== TAGS_KEY) || col.key === firstKey) continue;
    const val = record[col.key] === null || record[col.key] === undefined ? '' : String(record[col.key]).trim();
    if (!val) continue;
    const n = norm(col.label);

    if (SOURCE.has(n)) {
      const urls = val.match(URL_RE) ?? [];
      sidebar.sources.push(...(urls.length ? urls : [val]));
      continue;
    }
    if (QUOTE.has(n)) { sidebar.quotes.push(val); continue; }

    const ti = triadIndex(col.label);
    if (ti >= 0) {
      const kind = ti === 2 ? 'checklist' : 'markdown';
      triad.push({
        index: ti,
        section: { key: col.key, heading: col.label, kind, content: val, ...(kind === 'checklist' ? { items: checklistItems(val) } : {}) },
      });
      continue;
    }
    if (col.type === 'url') { sidebar.links.push({ label: col.label, url: (val.match(URL_RE)?.[0]) ?? val }); continue; }
    if (col.type === 'long-text') { others.push({ key: col.key, heading: col.label, kind: 'markdown', content: val }); continue; }
    if (col.type === 'select') { badges.push({ column: col.key, label: col.label, value: val }); continue; }
    if (col.type === 'multiselect') {
      for (const tag of splitTags(val)) badges.push({ column: col.key, label: col.label, value: tag });
      continue;
    }
    sidebar.raw.push({ label: col.label, value: val });
  }

  const sections = [...triad.sort((a, b) => a.index - b.index).map((t) => t.section), ...others];
  return { title, mode, sections, sidebar, badges };
}
