import Anthropic from '@anthropic-ai/sdk';

// Декомпозиция запроса на подтемы.
//
// Шаг 2: если задан ANTHROPIC_API_KEY — раскладываем промпт реальным Claude
// (осмысленные, привязанные к запросу подтемы). Если ключа нет или вызов упал —
// откатываемся на структурную эвристику, чтобы UX-флоу работал всегда.

const MODEL = process.env.RESEARCH_MODEL || 'claude-opus-5';

function heuristicSubtopics(prompt: string): string[] {
  const topic = prompt.trim().replace(/\s+/g, ' ').slice(0, 80) || 'тема';
  // универсальные исследовательские срезы, в каждый вплетена тема запроса —
  // так и сверка с каталогом (Шаг 3), и запуск (Шаг 5) находят релевантные
  // компании по каждой подтеме, а не только по первой.
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

async function claudeSubtopics(prompt: string): Promise<string[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      'Ты — старший аналитик рынка AI-продуктов. Тебе дают исследовательский ' +
      'запрос, ты раскладываешь его на 8–10 конкретных, взаимно не пересекающихся, ' +
      'проверяемых подтем на русском языке. Каждая подтема — короткая формулировка ' +
      '(до ~8 слов), пригодная для отдельного поиска. Покрой: игроков/продукты, ' +
      'технологии, рынок и тренды, монетизацию, риски, кейсы. Не добавляй нумерацию ' +
      'и пояснений.',
    messages: [
      {
        role: 'user',
        content: `Запрос для исследования: "${prompt}"\n\nВерни ТОЛЬКО JSON-массив строк (подтемы), без текста вокруг.`,
      },
      // префилл открывающей скобкой заставляет модель сразу писать JSON-массив
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

export async function POST(request: Request): Promise<Response> {
  let prompt = '';
  try {
    const body = await request.json();
    prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  } catch {
    /* empty body */
  }

  if (!prompt.trim()) {
    return Response.json({ error: 'Пустой запрос' }, { status: 400 });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const subtopics = await claudeSubtopics(prompt);
      if (subtopics.length >= 3) {
        return Response.json({ prompt, subtopics, source: 'claude' });
      }
    } catch (e) {
      // любой сбой (нет сети/лимиты/ключ) — тихо откатываемся на эвристику
      console.error('claude decompose failed, falling back:', e);
    }
  }

  const subtopics = heuristicSubtopics(prompt);
  return Response.json({ prompt, subtopics, source: 'heuristic' });
}
