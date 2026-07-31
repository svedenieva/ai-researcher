// Декомпозиция запроса на подтопики.
//
// Шаг 1: пока структурная заглушка (research-скелет из запроса) — она позволяет
// пройти весь UX-флоу без внешних зависимостей. Роут уже готов под Claude: когда
// появится ключ/подписка, заменяем `heuristicSubtopics` на реальный вызов
// (декомпозиция промпта на ~10 проверяемых подтем).

function heuristicSubtopics(prompt: string): string[] {
  const topic = prompt.trim().replace(/\s+/g, ' ').slice(0, 80) || 'тема';
  // универсальные исследовательские срезы + привязка к теме запроса
  return [
    `Обзор: что такое «${topic}» и зачем`,
    `Ключевые игроки и продукты по теме`,
    `Технологии и подходы`,
    `Рынок: размер, динамика, тренды`,
    `Ценообразование и монетизация`,
    `Риски и ограничения`,
    `Лучшие практики и кейсы`,
    `Источники и эксперты по теме`,
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
