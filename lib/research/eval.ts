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
//   - hygiene: empty rows (blanks left behind) and duplicate rows (the same
//     entry written twice) — noise a good run keeps near zero.

// This module is imported by a CLIENT component (the research page uses
// extractRow / scoreRows), so it stays pure — no Node built-ins. The fetching
// part (quoteFoundOnPage) is in ./verify-quote, which the client never imports.

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
  // hygiene: rows a research run shouldn't have produced
  emptyRows: number; // no name, no quote, no link — a blank the run left behind
  duplicateRows: number; // rows whose name repeats one already seen (case-insensitive)
  emptyRate: number;
  duplicateRate: number;
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

  // hygiene metrics: blanks and repeats the run shouldn't have left
  const emptyRows = rows.filter((r) => !r.name && !r.quote && !r.link).length;
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const r of rows) {
    const key = r.name.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!key) continue; // an empty name isn't a "duplicate", it's an empty row
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }

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
    emptyRows,
    duplicateRows,
    emptyRate: total ? emptyRows / total : 0,
    duplicateRate: total ? duplicateRows / total : 0,
  };
}

// The honest, expensive check — "is the quote actually on the cited page?" —
// lives in ./verify-quote (server-only: it fetches, pulling node:dns). Kept out
// of this file so the client can import extractRow / scoreRows without it.
