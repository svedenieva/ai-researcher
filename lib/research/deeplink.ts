// Variant C — research on the user's own Claude subscription via a deeplink.
// The site does NOT call Claude itself (Anthropic forbids third parties from
// using someone else's subscription). Instead it opens the user's OWN Claude
// with a ready-made prompt: the user presses Enter, their Claude researches with
// its own tools and the AI-Researcher connector, and SAVES the result into a
// "run base". The site then reads that base and shows the result.
//
// Deeplink format is official (support.claude.com "Open Claude with a link"):
// claude://claude.ai/new?q=<prompt> (desktop) and https://claude.ai/new?q=<prompt>
// (web). The prompt is PREFILLED but not auto-sent — the user presses Enter.
// The q limit is ~14,000 chars; our instruction is far shorter.
//
// NOTE: the instruction text below is user/Claude-facing, so it stays in Russian
// (the team's language) — only code comments are in English.

/** Instruction for Claude: research ANY question (not just companies) — search
    our own bases first, then the web; save a topic-shaped table into the run
    base (Claude picks the columns itself via add_column); then give a written
    summary. Answers in the language of the question. */
export function researchInstruction(topic: string, baseId: string): string {
  return (
    `Исследуй вопрос: "${topic}". Отвечай и оформляй результат на языке вопроса.\n\n` +
    `1. Разбери вопрос на 5–10 ключевых аспектов — по смыслу вопроса, не по шаблону ` +
    `(это НЕ обязательно «компании»).\n\n` +
    `2. Ищи в таком порядке:\n` +
    `   а) Сначала — в наших данных: инструменты коннектора list_bases, query_records ` +
    `и catalog_search — найди уже собранное по теме и переиспользуй.\n` +
    `   б) Потом добери недостающее своим веб-поиском. Только реальные факты с ` +
    `источниками — ничего не выдумывай; нет надёжного источника — так и напиши, пункт пропусти.\n` +
    `   в) На каждую строку — прямая ссылка на первоисточник и ДОСЛОВНАЯ цитата из него ` +
    `(одно-два предложения), подтверждающая именно то, что написано в строке. Цитата должна ` +
    `находиться поиском по странице. Не можешь привести цитату — не добавляй строку.\n\n` +
    `3. Сохрани результат ТАБЛИЦЕЙ в базу base="${baseId}":\n` +
    `   • Сам определи 3–6 колонок, которые точнее всего описывают ответ на ЭТОТ вопрос, ` +
    `и добавь их инструментом add_column (в базе уже есть «Название», «Цитата» и «Источники» — ` +
    `используй их и добавь недостающие). Колонки «Цитата» и «Источники» удалять нельзя ` +
    `и оставлять пустыми тоже — это то, по чему человек проверяет строку.\n` +
    `   • Заполни строки инструментом add_rows: одна строка = один объект/факт/пункт ` +
    `по смыслу вопроса; значения — по ключам колонок.\n\n` +
    `4. После таблицы дай связный разбор: 1–3 абзаца с выводами и ссылками на ` +
    `первоисточники (разбор остаётся в этом чате, на сайт уедет таблица).`
  );
}

export interface ResearchDeeplinks {
  instruction: string;
  /** universal link for the web (opens in the browser / app) */
  web: string;
  /** URL scheme for the Claude desktop app */
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
