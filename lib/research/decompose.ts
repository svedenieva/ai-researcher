import Anthropic from '@anthropic-ai/sdk';

// Decomposing a query into subtopics — used by the connector's research_decompose
// tool. Called directly (no HTTP self-request).
//
// Provider priority:
//   1) Anthropic (ANTHROPIC_API_KEY);
//   2) structural heuristic — if there's no key or the call failed.

const ANTHROPIC_MODEL = process.env.RESEARCH_MODEL || 'claude-opus-5';

const SYSTEM_PROMPT =
  'You are a senior analyst of the AI product market. Given a research query, ' +
  'break it into 8-10 concrete, mutually non-overlapping, checkable subtopics, ' +
  'written in the LANGUAGE OF THE QUERY. Each subtopic is a short phrase ' +
  '(about 8 words at most) that stands on its own as a search. Cover: players ' +
  'and products, technology, market and trends, monetisation, risks, case ' +
  'studies. Add no numbering and no explanations.';

export interface Decomposition {
  prompt: string;
  subtopics: string[];
  source: 'claude' | 'heuristic';
}

function heuristicSubtopics(prompt: string): string[] {
  const topic = prompt.trim().replace(/\s+/g, ' ').slice(0, 80) || 'topic';
  return [
    `Overview: what "${topic}" is and why it matters`,
    `Key players and products: ${topic}`,
    `Technology and approaches: ${topic}`,
    `Market, momentum and trends: ${topic}`,
    `Pricing and monetisation: ${topic}`,
    `Risks and limitations: ${topic}`,
    `Best practices and case studies: ${topic}`,
    `Sources and experts: ${topic}`,
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
        content: `Research query: "${prompt}"\n\nReturn ONLY a JSON array of strings (the subtopics), with no surrounding text.`,
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
