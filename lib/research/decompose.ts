import Anthropic from '@anthropic-ai/sdk';

// Декомпозиция запроса на подтемы — общий код для роута /api/research/decompose
// и для инструмента коннектора research_decompose.
//
// Раньше коннектор дёргал роут по HTTP сам к себе. На проде это упиралось в
// защиту приложения: самозапрос без куки сессии получал редирект на /login,
// а из HTML-страницы входа никаких подтем не вытащить — инструмент молча
// возвращал пустой список. Теперь логика вызывается напрямую, без сети.
//
// Приоритет провайдеров:
//   1) OpenRouter (OPENROUTER_API_KEY) — один ключ, любые модели;
//   2) Anthropic напрямую (ANTHROPIC_API_KEY);
//   3) структурная эвристика — если ключей нет или вызовы упали.

const ANTHROPIC_MODEL = process.env.RESEARCH_MODEL || 'claude-opus-5';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5';

const SYSTEM_PROMPT =
  'Ты — старший аналитик рынка AI-продуктов. Тебе дают исследовательский ' +
  'запрос, ты раскладываешь его на 8–10 конкретных, взаимно не пересекающихся, ' +
  'проверяемых подтем на русском языке. Каждая подтема — короткая формулировка ' +
  '(до ~8 слов), пригодная для отдельного поиска. Покрой: игроков/продукты, ' +
  'технологии, рынок и тренды, монетизацию, риски, кейсы. Не добавляй нумерацию ' +
  'и пояснений.';

export interface Decomposition {
  prompt: string;
  subtopics: string[];
  source: 'claude' | 'heuristic';
}

function heuristicSubtopics(prompt: string): string[] {
  const topic = prompt.trim().replace(/\s+/g, ' ').slice(0, 80) || 'тема';
  return [
    `Обзор: что такое «${topic}» и зачем`,
    `Ключевые игроки и продукты: ${topic}`,
    `Технологии и подходы: ${topic}`,
    `Рынок, динамика и тренды: ${topic}`,
    `Ценообразование и монетизация: ${topic}`,
    `Риски и ограничения: ${topic}`,
    `Лучшие практики и кейсы: ${topic}`,
    `Источники и эксперты: ${topic}`,
  ];
}

// вытащить JSON-массив из текста ответа (на случай пояснений вокруг)
function parseList(text: string): string[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
  } catch {
    return [];
  }
}

async function openrouterSubtopics(prompt: string): Promise<string[]> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ai-reesearcher.vercel.app',
      'X-Title': 'AI-Researcher',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Запрос для исследования: "${prompt}"\n\nВерни ТОЛЬКО JSON-массив строк (подтемы), без текста вокруг.`,
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? '';
  return parseList(text);
}

async function claudeSubtopics(prompt: string): Promise<string[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Запрос для исследования: "${prompt}"\n\nВерни ТОЛЬКО JSON-массив строк (подтемы), без текста вокруг.`,
      },
      { role: 'assistant', content: '[' },
    ],
  });

  const text =
    '[' +
    message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  return parseList(text);
}

/** Разложить запрос на подтемы; всегда возвращает непустой список. */
export async function decompose(prompt: string): Promise<Decomposition> {
  const clean = prompt.trim();
  if (!clean) return { prompt: '', subtopics: [], source: 'heuristic' };

  const providers: Array<[string, () => Promise<string[]>]> = [];
  if (process.env.OPENROUTER_API_KEY) providers.push(['openrouter', () => openrouterSubtopics(clean)]);
  if (process.env.ANTHROPIC_API_KEY) providers.push(['anthropic', () => claudeSubtopics(clean)]);

  for (const [name, run] of providers) {
    try {
      const subtopics = await run();
      if (subtopics.length >= 3) return { prompt: clean, subtopics, source: 'claude' };
    } catch (e) {
      console.error(`decompose via ${name} failed, falling back:`, e);
    }
  }

  return { prompt: clean, subtopics: heuristicSubtopics(clean), source: 'heuristic' };
}
