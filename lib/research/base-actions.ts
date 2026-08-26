// AI actions on an EXISTING base — Variant C, like research: we can't call Claude
// ourselves, so each action opens the user's OWN Claude with a ready-made prompt
// that reads the base through the AI-Researcher connector and answers. These are
// READ-ONLY: the answer stays in the user's Claude chat, nothing is written back,
// so there's no run base and no polling — just open the link.
//
// The prompts are English (models follow them best) but tell Claude to answer in
// the base's own language. baseId/baseName are interpolated into the connector call.

export type BaseAction = 'ask' | 'gaps' | 'summary';

function links(instruction: string): { web: string; desktop: string; instruction: string } {
  const q = encodeURIComponent(instruction);
  return {
    instruction,
    web: `https://claude.ai/new?q=${q}`,
    desktop: `claude://claude.ai/new?q=${q}`,
  };
}

// Shared preamble: how to load the base through the connector.
function readBase(baseId: string, baseName: string): string {
  return (
    `Using the AI-Researcher MCP connector, load the base «${baseName}» (base id "${baseId}"): ` +
    `call get_base for its columns, then query_records to read its rows. `
  );
}

/** Answer a question using only what's in the base, citing the rows used. */
export function askBase(baseId: string, baseName: string, question: string) {
  return links(
    readBase(baseId, baseName) +
      `Then answer this question using ONLY what the base actually contains: "${question}". ` +
      `Cite the specific rows you used (their name and «Источники» link). If the base doesn't ` +
      `have enough to answer, say exactly what's missing rather than guessing. ` +
      `Answer in the language of the question.`,
  );
}

/** List what the base is missing — turns into the next research query. */
export function findGaps(baseId: string, baseName: string) {
  return links(
    readBase(baseId, baseName) +
      `Then list what is MISSING or under-covered: aspects, categories, competitors, use-cases or ` +
      `angles the base does not yet include. Group the gaps, and for each give a concrete next ` +
      `research query that would fill it. Base your judgement only on the rows present. ` +
      `Answer in the base's language.`,
  );
}

/** Trends / clusters / takeaway over the whole base. */
export function summarize(baseId: string, baseName: string) {
  return links(
    readBase(baseId, baseName) +
      `Then give a concise summary of the whole base: the main clusters or categories, notable ` +
      `trends, any outliers, and a one-line takeaway. Reference rows by name where it helps. ` +
      `Do not invent anything beyond the rows. Answer in the base's language.`,
  );
}
