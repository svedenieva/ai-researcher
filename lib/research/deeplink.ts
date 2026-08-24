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
    `1. Break the question down into 5–10 key aspects — led by what the question actually asks, ` +
    `not by a template (it is NOT necessarily about "companies").

` +
    `2. Search in this order:
` +
    `   a) First call list_trusted_sources with this topic — the company's vetted platforms, ` +
    `channels and experts. Cover those sources before anything else.
` +
    `   b) Then our own data: the connector tools list_bases, query_records and catalog_search — ` +
    `find what has already been collected on the topic and reuse it.
` +
    `   c) Then fill the gaps with your own web search. Real, sourced facts only — invent nothing; ` +
    `if there is no reliable source, say so and skip the point.
` +
    `   d) Every row needs a direct link to the primary source AND a VERBATIM quote from it ` +
    `(one or two sentences) supporting exactly what the row claims. The quote must be findable by ` +
    `searching the page. If you cannot quote it, do not add the row.

` +
    `3. Save the result as a TABLE into base="${baseId}":
` +
    `   • Decide for yourself on the 3–6 columns that best describe the answer to THIS question ` +
    `and add them with add_column (the base already has «Название», «Цитата» and «Источники» — ` +
    `use those and add what is missing). The «Цитата» and «Источники» columns must not be deleted ` +
    `and must not be left empty — they are what a human checks the row against.
` +
    `   • Fill the rows with add_rows: one row = one object / fact / point, by the sense of the ` +
    `question; values keyed by the column keys.

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
