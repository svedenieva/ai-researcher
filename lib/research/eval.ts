// The measure before the engine. Step 1 of the research roadmap: before "it got
// better" can mean anything, we need numbers. This scores a set of result rows
// (as produced by a research run into a base) on the things that actually make a
// research answer trustworthy:
//   - link rate:  share of rows that cite a primary-source link
//   - quote rate: share of rows that carry a non-trivial verbatim quote
//   - subtopic coverage: share of the question's expected aspects touched
//   - quote-found rate (opt-in, network): share of quotes actually present on
//     the page they cite — the expensive, honest metric and the seed of the
//     verifier pass (a row whose quote isn't on its page shouldn't count).

export interface EvalRow {
  name: string;
  quote: string;
  link: string;
}

export interface RowScore {
  total: number;
  withLink: number;
  withQuote: number;
  linkRate: number;
  quoteRate: number;
  subtopicCoverage: number;
  coveredSubtopics: string[];
  missingSubtopics: string[];
}

function text(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

const URL_RE = /https?:\/\/[^\s"'<>)]+/i;
function firstUrl(s: string): string {
  return URL_RE.exec(s)?.[0] ?? '';
}

// Pull {name, quote, link} out of a run-base record, tolerant of the ru/uk/en
// column keys the seeded columns use («Название»/«Цитата»/«Источники»).
export function extractRow(r: Record<string, unknown>): EvalRow {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const t = text(r[k]);
      if (t) return t;
    }
    return '';
  };
  const linkField = pick('источники', 'источник', 'sources', 'source', 'url', 'ссылка', 'посилання');
  return {
    name: pick('название', 'назва', 'name', 'title'),
    quote: pick('цитата', 'quote'),
    link: firstUrl(linkField) || (URL_RE.test(linkField) ? linkField : ''),
  };
}

/** Cheap, offline metrics over the rows of one research answer. */
export function scoreRows(rows: EvalRow[], subtopics: string[] = []): RowScore {
  const total = rows.length;
  const withLink = rows.filter((r) => r.link).length;
  // a real quote is more than a word or two; guard against "—" and stray tokens
  const withQuote = rows.filter((r) => r.quote.replace(/\s+/g, ' ').trim().length >= 12).length;

  const haystack = rows.map((r) => `${r.name} ${r.quote}`).join(' ').toLowerCase();
  const covered: string[] = [];
  const missing: string[] = [];
  for (const s of subtopics) {
    const words = s.toLowerCase().split(/[\s,/]+/).filter((w) => w.length > 2);
    const hit = words.length > 0 && words.some((w) => haystack.includes(w));
    (hit ? covered : missing).push(s);
  }

  return {
    total,
    withLink,
    withQuote,
    linkRate: total ? withLink / total : 0,
    quoteRate: total ? withQuote / total : 0,
    subtopicCoverage: subtopics.length ? covered.length / subtopics.length : 0,
    coveredSubtopics: covered,
    missingSubtopics: missing,
  };
}

// ── the honest, expensive check ────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[«»"“”'’‘`]/g, '"')
    .trim()
    .toLowerCase();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/**
 * Is the quote actually on the page it cites? Fetches the URL, strips markup and
 * checks whether a meaningful slice of the (normalised) quote appears in the
 * (normalised) page text. Not exact — pages reflow — so it matches on the first
 * ~120 normalised chars, which is enough to tell a real quote from an invented one.
 * `fetchImpl` is injectable for tests.
 */
export async function quoteFoundOnPage(
  url: string,
  quote: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const needle = normalize(quote);
  if (!url || needle.length < 12) return false;
  let body: string;
  try {
    const res = await fetchImpl(url, { redirect: 'follow' });
    if (!res.ok) return false;
    body = await res.text();
  } catch {
    return false;
  }
  const hay = normalize(stripHtml(body));
  // whole quote, or its leading slice for long/edited quotes
  return hay.includes(needle) || hay.includes(needle.slice(0, 120));
}
