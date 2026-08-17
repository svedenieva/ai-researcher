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

/** Instruction for Claude: research the topic and save the result into the run
    base via the connector's add_rows tool (fields = REPORT_COLUMNS). */
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
