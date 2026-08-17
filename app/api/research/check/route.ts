import { getDataSource } from '@/lib/datasource';

// Matching subtopics against the catalog — no AI. From each subtopic we take
// the meaningful words (dropping common/stop words), search for them in the
// catalog record texts, and count how many companies matched. Matches → "already
// researched", none → "new".

const STOP = new Set([
  // stop words
  'что', 'такое', 'зачем', 'для', 'как', 'или', 'при', 'это', 'все', 'всё',
  'есть', 'быть', 'свой', 'наш', 'них', 'под', 'над', 'без', 'про', 'из',
  'по', 'на', 'в', 'и', 'с', 'the', 'and', 'for', 'with',
  // generic research terms (from the decomposition skeleton)
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

export async function POST(request: Request): Promise<Response> {
  let subtopics: string[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.subtopics)) subtopics = body.subtopics.map(String);
  } catch {
    /* empty */
  }

  const records = await getDataSource().list();
  // set of whole-word tokens per record — exact match, no substring noise
  // (so "rag" won't match "storage")
  const docs = records.map((r) => ({
    name: String(r.name ?? ''),
    tokens: new Set(
      Object.values(r)
        .filter((v) => typeof v === 'string')
        .join(' ')
        .toLowerCase()
        .split(/[^a-zа-яё0-9]+/i)
        .filter(Boolean),
    ),
  }));

  const results = subtopics.map((sub) => {
    const kws = keywords(sub);
    if (!kws.length) return { subtopic: sub, count: 0, matches: [] as string[] };
    const scored = docs
      .map((d) => ({ name: d.name, hits: kws.filter((k) => d.tokens.has(k)).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      subtopic: sub,
      count: scored.length,
      matches: scored.slice(0, 5).map((x) => x.name),
    };
  });

  return Response.json({ results });
}
