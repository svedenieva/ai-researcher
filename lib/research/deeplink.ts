// Вариант C — исследование на подписке пользователя через deeplink.
// Сайт не вызывает Claude сам (это запрещено Anthropic для чужой подписки).
// Вместо этого он открывает СОБСТВЕННЫЙ Claude пользователя по ссылке с готовым
// промптом: пользователь жмёт Enter, его Claude исследует своими инструментами
// и коннектором AI-Researcher, а результат СОХРАНЯЕТ в «базу запуска». Сайт
// потом читает эту базу и показывает результат.
//
// Формат deeplink — официальный (support.claude.com «Open Claude with a link»):
// claude://claude.ai/new?q=<промпт> (десктоп) и https://claude.ai/new?q=<промпт>
// (веб). Промпт ПОДСТАВЛЯЕТСЯ, но не отправляется сам — пользователь жмёт Enter.
// Лимит q — ~14 000 символов, наша инструкция сильно короче.

/** Инструкция для Claude: исследовать тему и сохранить результат в базу запуска
    через инструмент коннектора add_rows (поля = REPORT_COLUMNS). */
export function researchInstruction(topic: string, baseId: string): string {
  return (
    `Проведи исследование по теме: "${topic}".\n\n` +
    `1. Разложи тему на 6–10 конкретных подтем.\n` +
    `2. По каждой подтеме найди РЕАЛЬНЫЕ компании и продукты: своим веб-поиском ` +
    `плюс инструментом «catalog_search» коннектора AI-Researcher — сверься с каталогом.\n` +
    `3. СОХРАНИ найденное в базу через инструмент коннектора AI-Researcher «add_rows» ` +
    `с параметром base="${baseId}". Одна строка = одна компания, поля:\n` +
    `{"Название":"…","Что делает":"…","Ссылка":"https://…",` +
    `"Подтема":"…","Статус":"в каталоге" или "новое","Источники":"url1\\nurl2"}.\n\n` +
    `Не выдумывай компании — только реальные, подтверждённые источниками. ` +
    `Когда сохранишь строки в базу — коротко подытожь, что нашёл.`
  );
}

export interface ResearchDeeplinks {
  instruction: string;
  /** universal-ссылка для веба (открывается в браузере/приложении) */
  web: string;
  /** схема для десктоп-приложения Claude */
  desktop: string;
}

export function researchDeeplinks(topic: string, baseId: string): ResearchDeeplinks {
  const instruction = researchInstruction(topic, baseId);
  const q = encodeURIComponent(instruction);
  return {
    instruction,
    web: `https://claude.ai/new?q=${q}`,
    desktop: `claude://claude.ai/new?q=${q}`,
  };
}
