import { getDataSource } from '@/lib/datasource';
import type { CatalogRecord } from '@/lib/datasource/types';

// Шаг 5 — запуск исследования.
//
// Пока MOCK_MODE: настоящий Claude/веб-поиск ещё не подключены, поэтому по
// каждой подтеме мы собираем отчёт из РЕАЛЬНОГО каталога (412 компаний из
// Supabase) — находим релевантные записи и строим по ним сводку. Это даёт
// живой, связанный с данными результат для показа, а структура ответа уже
// готова под реальный движок: заменяем `mockReport` на вызов Claude+поиска,
// формат `Finding` остаётся тем же.

const STOP = new Set([
  'что', 'такое', 'зачем', 'для', 'как', 'или', 'при', 'это', 'все', 'всё',
  'есть', 'быть', 'свой', 'наш', 'них', 'под', 'над', 'без', 'про', 'из',
  'по', 'на', 'в', 'и', 'с', 'the', 'and', 'for', 'with',
  'обзор', 'ключевые', 'игроки', 'игрок', 'продукты', 'продукт', 'тема', 'теме',
  'темы', 'технологии', 'технология', 'подходы', 'подход', 'рынок', 'размер',
  'динамика', 'тренды', 'тренд', 'ценообразование', 'монетизация', 'риски',
  'риск', 'ограничения', 'ограничение', 'лучшие', 'практики', 'практика',
  'кейсы', 'кейс', 'источники', 'источник', 'эксперты', 'эксперт',
]);

function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-zа-яё0-9]+/i)
        .filter((w) => w.length >= 3 && !STOP.has(w)),
    ),
  ];
}

interface RelevantCompany {
  id: string;
  name: string;
  verdict: string | null;
  vertical: string | null;
  url: string | null;
}

interface Finding {
  subtopic: string;
  summary: string;
  findings: string[];
  relevant: RelevantCompany[];
  sources: Array<{ title: string; url: string }>;
  source: 'mock';
}

function str(v: CatalogRecord[string]): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

// одна подтема → отчёт, собранный из релевантных записей каталога
function mockReport(
  subtopic: string,
  docs: Array<{ record: CatalogRecord; tokens: Set<string> }>,
): Finding {
  const kws = keywords(subtopic);
  const scored = docs
    .map((d) => ({ d, hits: kws.filter((k) => d.tokens.has(k)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 6)
    .map((x) => x.d.record);

  const relevant: RelevantCompany[] = scored.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? '—'),
    verdict: str(r.verdict),
    vertical: str(r.vertical),
    url: str(r.url),
  }));

  const sources = scored
    .map((r) => ({ title: String(r.name ?? ''), url: str(r.url) }))
    .filter((s): s is { title: string; url: string } => Boolean(s.url));

  if (!relevant.length) {
    return {
      subtopic,
      summary: `Прямых совпадений по теме «${subtopic}» в базе нет — потенциально новая ниша, которую стоит исследовать отдельно.`,
      findings: [
        'В текущем каталоге (412 компаний) релевантных игроков не найдено.',
        'Это может значить недоохваченный сегмент — кандидат на добавление в витрину.',
        'Рекомендуется отдельный прогон веб-поиска (Tavily) при подключении реального движка.',
      ],
      relevant: [],
      sources: [],
      source: 'mock',
    };
  }

  const names = relevant.map((r) => r.name);
  const verticals = [...new Set(relevant.map((r) => r.vertical).filter(Boolean))];
  const build = relevant.filter((r) => r.verdict && /постро|build|своё|own/i.test(r.verdict));

  const findings: string[] = [
    `По теме в базе найдено ${relevant.length} релевантных компаний: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ' и др.' : ''}.`,
    verticals.length
      ? `Основные вертикали: ${verticals.join(', ')}.`
      : 'Игроки распределены по нескольким вертикалям.',
    build.length
      ? `${build.length} из них помечены как кандидаты «строить своё» — есть окно для собственного продукта AiVocado.`
      : 'Большинство — зрелые продукты; вероятнее сценарий «брать готовым» или мониторить.',
    `Топ по релевантности: ${names[0]}${names[1] ? ` и ${names[1]}` : ''} — с них стоит начать глубокий разбор.`,
  ];

  return {
    subtopic,
    summary: `«${subtopic}»: по теме в каталоге найдено ${relevant.length} релевантных компаний. Ниже — сводка и что это значит для AiVocado.`,
    findings,
    relevant,
    sources,
    source: 'mock',
  };
}

export async function POST(request: Request): Promise<Response> {
  let subtopics: string[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.subtopics)) {
      subtopics = body.subtopics.map(String).filter((s: string) => s.trim());
    }
  } catch {
    /* empty body */
  }

  if (!subtopics.length) {
    return Response.json({ error: 'Нет подтем для исследования' }, { status: 400 });
  }

  const records = await getDataSource().list();
  const docs = records.map((record) => ({
    record,
    tokens: new Set(
      Object.values(record)
        .filter((v) => typeof v === 'string')
        .join(' ')
        .toLowerCase()
        .split(/[^a-zа-яё0-9]+/i)
        .filter(Boolean),
    ),
  }));

  // TODO(реальный движок): если доступен Claude (подписка/DeepLinks) + веб-поиск —
  // по каждой подтеме гнать поиск (Tavily) и синтез (Claude) вместо mockReport.
  const report = subtopics.map((sub) => mockReport(sub, docs));

  return Response.json({ report, mode: 'mock' });
}
