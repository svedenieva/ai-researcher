// Декомпозиция запроса на подтопики.
//
// Шаг 1: пока структурная заглушка (research-скелет из запроса) — она позволяет
// пройти весь UX-флоу без внешних зависимостей. Роут уже готов под Claude: когда
// появится ключ/подписка, заменяем `heuristicSubtopics` на реальный вызов
// (декомпозиция промпта на ~10 проверяемых подтем).

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

  // TODO(шаг 2): если доступен Claude (ключ/подписка) — декомпозировать промпт
  // на ~10 проверяемых подтем реальным вызовом вместо заглушки.
  const subtopics = heuristicSubtopics(prompt);

  return Response.json({ prompt, subtopics, source: 'heuristic' });
}
