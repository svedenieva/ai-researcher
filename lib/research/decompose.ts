import Anthropic from '@anthropic-ai/sdk';

// Decomposing a query into subtopics — used by the connector's research_decompose
// tool. Called directly (no HTTP self-request).
//
// Provider priority:
//   1) Anthropic (ANTHROPIC_API_KEY);
//   2) structural heuristic — if there's no key or the call failed.

const ANTHROPIC_MODEL = process.env.RESEARCH_MODEL || 'claude-opus-5';

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

// pull a JSON array out of the response text (in case of surrounding prose)
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

/** Decompose a query into subtopics; always returns a non-empty list. */
export async function decompose(prompt: string): Promise<Decomposition> {
  const clean = prompt.trim();
  if (!clean) return { prompt: '', subtopics: [], source: 'heuristic' };

  const providers: Array<[string, () => Promise<string[]>]> = [];

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
