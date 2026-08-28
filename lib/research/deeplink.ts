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
// NOTE: the instruction below is written in English, but it opens by telling
// Claude to answer in the language of the QUESTION — so a Russian question
// still comes back in Russian. The column names it references stay verbatim
// («Название», «Цитата», «Источники»): they are the real labels of the seeded
// columns, and Claude matches rows against them. Translating those here would
// make Claude create a second, English set of columns instead of filling ours.

/** Instruction for Claude (English text, answer in the question's language):
    research ANY question (not just companies) — search
    our own bases first, then the web; save a topic-shaped table into the run
    base (Claude picks the columns itself via add_column); then give a written
    summary. Answers in the language of the question. */
export function researchInstruction(topic: string, baseId: string): string {
  return (
    `Research this question: "${topic}". Answer and label the result in the language of the question.

` +
    `0. FIRST check you actually have the AiS connector: you need the tools list_bases and ` +
    `add_rows. If you do NOT have a tool called add_rows, STOP and tell the user, in the ` +
    `question's language: "Підключи конектор AiS, щоб я зміг зберегти результат: відкрий сторінку ` +
    `/connect на сайті й додай конектор у Claude (Settings → Connectors)." Do not run the research ` +
    `without it — the result has nowhere to be saved, so the site would stay empty.

` +
    `1. Break the question down into 5–10 key aspects — led by what the question actually asks, ` +
    `not by a template (it is NOT necessarily about "companies").

` +
    `2. Search in this order. THE USER'S OWN KNOWLEDGE BASE COMES FIRST — it is the ` +
    `primary source, not a fallback:
` +
    `   a) FIRST and foremost, search what the user has already collected: the connector ` +
    `tools list_bases, catalog_search and query_records. Read the relevant bases, lean the ` +
    `answer on what is already there, and REUSE existing rows and facts instead of re-finding ` +
    `them from scratch. This is the main emphasis of the whole task; only after you have ` +
    `exhausted the user's own data do you look outward.
` +
    `   b) Then call list_trusted_sources with this topic — the company's vetted platforms, ` +
    `channels and experts — to know where to look for whatever the bases don't already cover.
` +
    `   c) Only then fill the remaining gaps with your own web search. Deliberately include niche community ` +
    `discussion — Reddit threads (e.g. a site:reddit.com search, and the relevant subreddits), ` +
    `X/Twitter posts from practitioners and domain experts (e.g. a site:x.com or site:twitter.com ` +
    `search, and the accounts from the trusted-sources registry), and specialist forums — where ` +
    `people compare tools and share first-hand experience; do not stop at press releases and ` +
    `landing pages. Read the public pages themselves (some X posts are login-gated — use what is ` +
    `publicly visible). Real, sourced facts only — invent nothing; if there is no reliable source, ` +
    `say so and skip the point.
` +
    `   d) Every row needs a direct link to the primary source AND a VERBATIM quote from it ` +
    `(one or two sentences) supporting exactly what the row claims. The quote must be findable by ` +
    `searching the page. If you cannot quote it, do not add the row.

` +
    `3. Save the result as a TABLE into base="${baseId}":
` +
    `   • Decide for yourself on the 3–6 columns that best describe the answer to THIS question ` +
    `and add them with add_column (the base already has «Название», «Платформа», «Цитата» and ` +
    `«Источники» — use those and add what is missing). The «Цитата» and «Источники» columns must ` +
    `not be deleted and must not be left empty — they are what a human checks the row against.
` +
    `   • Fill «Платформа» for every row with the TYPE of source the fact came from, so the base ` +
    `can be sorted/grouped by it — one of: «Официальный сайт», «Reddit», «Twitter / X», «YouTube», ` +
    `«Форум», «Медиа», «Другое» (use these exact values).
` +
    `   • Fill the rows with add_rows: one row = one object / fact / point, by the sense of the ` +
    `question; values keyed by the column keys. Call add_rows with verify:"flag" — the server ` +
    `re-checks that each «Цитата» is actually on its «Источники» page and marks any that is not, ` +
    `so a quote you couldn't place gets caught rather than passing silently.

` +
    `4. After the table, give a connected analysis: 1–3 paragraphs of conclusions with links to ` +
    `primary sources (the analysis stays in this chat; the table is what travels to the site).`
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
