export const maxDuration = 120;
export const dynamic = 'force-dynamic';

import { getDataSource } from '@/lib/datasource';
import type { CatalogRecord } from '@/lib/datasource/types';
import type { Finding, RelevantCompany } from '@/lib/research/types';
import { modelCandidates, openrouterChat } from '@/lib/research/freeModels';

// Step 5 — running the research.
//
// For now MOCK_MODE: real Claude/web search aren't connected yet, so for each
// subtopic we build a report from the REAL catalog (412 companies from
// Supabase) — we find relevant records and construct a summary from them. This
// gives a live, data-backed result to display, and the response shape is already
// ready for the real engine: we replace `mockReport` with a Claude+search call,
// the `Finding` format stays the same.

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

// ── live engine: web search + synthesis via OpenRouter ───────────
// OpenRouter's web plugin searches on its own and returns links in annotations,
// so a separate search-engine key isn't needed.

const SYSTEM = `Ты — аналитик рынка AI-продуктов. По подтеме исследования найди в вебе
актуальные факты и компании. Отвечай СТРОГО одним JSON-объектом, без текста вокруг:
{"summary": "1-2 предложения сути", "findings": ["конкретный факт", "…"],
"companies": [{"name": "…", "what": "чем занимается", "url": "…"}]}
Правила: только то, что подтверждается найденными источниками; 3-5 фактов;
до 6 компаний; никаких выдуманных названий; пиши по-русски.`;

function parseJson(text: string): Record<string, unknown> | null {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e === -1 || e < s) return null;
  try {
    return JSON.parse(text.slice(s, e + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function webReport(
  subtopic: string,
  docs: Array<{ record: CatalogRecord; tokens: Set<string> }>,
): Promise<Finding | null> {
  const candidates = await modelCandidates();
  if (!candidates.length) return null;
  const result = await openrouterChat(
    {
      plugins: [{ id: 'web', max_results: 5 }],
      max_tokens: 1100,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Подтема исследования: "${subtopic}"` },
      ],
    },
    candidates,
  );
  if (!result) return null;

  const msg = (result.json as { choices?: { message?: { content?: string; annotations?: unknown[] } }[] })
    ?.choices?.[0]?.message;
  const parsed = parseJson(String(msg?.content ?? ''));
  if (!parsed) return null;

  const findings = Array.isArray(parsed.findings)
    ? parsed.findings.filter((x): x is string => typeof x === 'string')
    : [];
  const companies = Array.isArray(parsed.companies) ? parsed.companies : [];

  // links the model actually used
  const annotations = Array.isArray(msg?.annotations) ? msg.annotations : [];
  const sources: Array<{ title: string; url: string }> = [];
  for (const a of annotations) {
    const c = (a as { url_citation?: { title?: string; url?: string } })?.url_citation;
    if (c?.url) sources.push({ title: c.title || c.url, url: c.url });
  }

  // cross-check found companies against the catalog: existing ones get a link to the card
  const relevant: RelevantCompany[] = [];
  for (const raw of companies.slice(0, 6)) {
    const c = raw as { name?: unknown; what?: unknown; url?: unknown };
    const name = String(c?.name ?? '').trim();
    if (!name) continue;
    const known = docs.find((d) => String(d.record.name ?? '').toLowerCase() === name.toLowerCase());
    relevant.push({
      id: known ? String(known.record.id) : `web:${name}`,
      name,
      verdict: known ? str(known.record.verdict) : null,
      vertical: known ? str(known.record.vertical) : (typeof c.what === 'string' ? c.what : null),
      url: typeof c.url === 'string' ? c.url : known ? str(known.record.url) : null,
    });
  }

  const inBase = relevant.filter((r) => !r.id.startsWith('web:')).length;
  const summary =
    (typeof parsed.summary === 'string' ? parsed.summary : `«${subtopic}»`) +
    (relevant.length
      ? ` В каталоге уже есть ${inBase} из ${relevant.length} найденных.`
      : '');

  return { subtopic, summary, findings, relevant, sources, source: 'web' };
}

function str(v: CatalogRecord[string]): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

// one subtopic → a report assembled from relevant catalog records
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

  // Live engine, if a key is set: web search + synthesis per subtopic.
  // Subtopics run in parallel — otherwise a dozen sequential requests hit the
  // function timeout. On a given subtopic's failure we fall back to the
  // catalog analysis, so the report doesn't stay empty.
  if (process.env.OPENROUTER_API_KEY) {
    // reason the web engine failed, to show it in the UI rather than guess
    let reason: string | null = null;
    const report = await Promise.all(
      subtopics.map(async (sub) => {
        try {
          const live = await webReport(sub, docs);
          if (live) return live;
          reason ??= 'Модель вернула ответ, который не удалось разобрать.';
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('web report failed:', sub, msg);
          if (msg.includes('402')) {
            reason ??= 'На балансе OpenRouter закончились кредиты — пополните на openrouter.ai/settings/credits.';
          } else if (msg.includes('401') || msg.includes('403')) {
            reason ??= 'Ключ OpenRouter отклонён — проверьте OPENROUTER_API_KEY.';
          } else if (msg.includes('429')) {
            reason ??= 'OpenRouter ограничил частоту запросов — попробуйте через минуту.';
          } else {
            reason ??= `Веб-поиск не отработал: ${msg.slice(0, 120)}`;
          }
        }
        return mockReport(sub, docs);
      }),
    );
    const mode = report.every((r) => r.source === 'web') ? 'web' : 'mixed';
    return Response.json({ report, mode, reason });
  }

  const report = subtopics.map((sub) => mockReport(sub, docs));
  return Response.json({ report, mode: 'mock' });
}
