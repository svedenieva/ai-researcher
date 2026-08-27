// The honest, expensive metric: is the quote actually on the page it cites?
// Split out of eval.ts because it fetches (node:dns via safeFetch) and eval.ts
// is imported by a CLIENT component — this file is server-only.
//
// A link is cheap to invent; a quote that survives a search of the page is not.
// This is the seed of the verifier pass, and the check behind add_rows verify.

import { safeFetch } from '../net/safe-fetch';

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
 * Is the quote actually on the page it cites? Fetches the URL (SSRF-guarded, with
 * every redirect hop re-validated — see safeFetch), strips markup, and checks
 * whether a meaningful slice of the (normalised) quote appears in the (normalised)
 * page text. Not exact — pages reflow — so it matches on the first ~120 normalised
 * chars, enough to tell a real quote from an invented one. `fetchImpl` is
 * injectable for tests (which stay offline).
 */
export async function quoteFoundOnPage(
  url: string,
  quote: string,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  const needle = normalize(quote);
  if (!url || needle.length < 12) return false;
  let body: string;
  try {
    const res = fetchImpl ? await fetchImpl(url, { redirect: 'follow' }) : await safeFetch(url);
    if (!res.ok) return false;
    body = await res.text();
  } catch {
    return false;
  }
  const hay = normalize(stripHtml(body));
  return hay.includes(needle) || hay.includes(needle.slice(0, 120));
}
