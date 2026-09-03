// ТР-БИ-06: счётчики наполнения направления по категориям источников.
// Категория источника выводится ЭВРИСТИЧЕСКИ — по явной колонке типа, а при её
// отсутствии по ссылке (github → репозиторий, youtube/telegram → канал,
// linkedin/in → эксперт, остальные ссылки → страница). Это оценка, не истина в
// последней инстанции: колонка «тип» всегда важнее догадки по URL.
import type { CatalogRecord, ColumnDef } from './datasource/types';

export type SourceKind = 'experts' | 'repos' | 'channels' | 'pages' | 'other';

export interface SourceCounts {
  experts: number;
  repos: number;
  channels: number;
  pages: number;
  other: number;
  total: number;
}

/** Норматив наполнения направления (§ ТР-БИ-06). */
export const SOURCE_NORMS: Partial<Record<SourceKind, number>> = { experts: 10, repos: 20 };

const RE_REPO = /(github|gitlab|bitbucket|huggingface)\./i;
const RE_CHANNEL = /(youtube\.com|youtu\.be|t\.me|telegram\.me|twitch\.tv|vimeo\.com|rutube\.ru)/i;
const RE_EXPERT_URL = /linkedin\.com\/in\//i;
const RE_URL = /^https?:\/\//i;

// слова, по которым явная колонка типа относит запись к категории
const WORDS: Array<[SourceKind, RegExp]> = [
  ['experts', /эксперт|эксперти|expert|специалист|автор|person|людин|человек/i],
  ['repos', /репозитор|repo|github|код|library|библиотек/i],
  ['channels', /канал|channel|youtube|видео|подкаст|podcast|телеграм|telegram/i],
  ['pages', /страниц|сторінк|page|сайт|site|статья|стаття|блог|blog/i],
];

function urlsOf(record: CatalogRecord, columns: ColumnDef[]): string[] {
  const out: string[] = [];
  for (const col of columns) {
    const v = record[col.key];
    if (v == null || v === '') continue;
    const s = String(v);
    if (col.type === 'url' || RE_URL.test(s)) out.push(s);
  }
  return out;
}

// значение колонки, похожей на «тип/категория/роль» источника
function explicitKind(record: CatalogRecord, columns: ColumnDef[]): SourceKind | null {
  const typeCols = columns.filter((c) => /тип|катего|роль|role|kind|type|вид/i.test(c.label) || /тип|katego|role|kind|type/i.test(c.key));
  for (const col of typeCols) {
    const v = record[col.key];
    if (v == null || v === '') continue;
    const s = String(v);
    for (const [kind, re] of WORDS) if (re.test(s)) return kind;
  }
  return null;
}

export function classifySource(record: CatalogRecord, columns: ColumnDef[]): SourceKind {
  const explicit = explicitKind(record, columns);
  if (explicit) return explicit;
  const urls = urlsOf(record, columns);
  if (urls.some((u) => RE_EXPERT_URL.test(u))) return 'experts';
  if (urls.some((u) => RE_REPO.test(u))) return 'repos';
  if (urls.some((u) => RE_CHANNEL.test(u))) return 'channels';
  if (urls.length) return 'pages';
  // без ссылки и без явного типа — пробуем угадать по любым текстовым полям
  const blob = columns.map((c) => String(record[c.key] ?? '')).join(' ');
  for (const [kind, re] of WORDS) if (re.test(blob)) return kind;
  return 'other';
}

export function countSources(records: CatalogRecord[], columns: ColumnDef[]): SourceCounts {
  const counts: SourceCounts = { experts: 0, repos: 0, channels: 0, pages: 0, other: 0, total: records.length };
  for (const r of records) counts[classifySource(r, columns)] += 1;
  return counts;
}

/** норматив достигнут по этой категории? (undefined — норматива нет) */
export function normMet(kind: SourceKind, counts: SourceCounts): boolean | undefined {
  const norm = SOURCE_NORMS[kind];
  if (norm === undefined) return undefined;
  return counts[kind] >= norm;
}
