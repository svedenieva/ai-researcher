// Mechanical source checking: does the link a research row cites actually
// resolve? This is deliberately NOT fact-checking — it cannot tell whether a
// page supports the claim, only whether it exists. That distinction is the
// whole point: this part is deterministic and honest, and the judgement stays
// with the person who flips the row to "Проверено".

import type { ColumnDef } from '../datasource/types';
import { safeFetch, hostLooksPrivate } from '../net/safe-fetch';

/** Column the verdict is written into. Lives here, not in the route file:
    Next.js route modules may only export handlers and route config. */
export const CHECK_COLUMN: ColumnDef = {
  key: 'проверка_ссылок',
  label: 'Проверка',
  type: 'text',
  sortable: true,
};

/** Anything that looks like an http(s) URL inside a free-text cell. */
const URL_RE = /https?:\/\/[^\s<>"'`)\]}]+/gi;

export function extractUrls(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const found = String(value).match(URL_RE) ?? [];
  // trailing punctuation clings to URLs pasted inside prose
  return found.map((u) => u.replace(/[.,;:!?]+$/, ''));
}

// Cheap, synchronous gate: the server makes these requests, so a "source" pasted
// by anyone must not aim them at the private network or the cloud metadata
// endpoint. hostLooksPrivate covers literal, numeric (2130706433, 0x7f000001)
// and local-name forms; the DNS-resolving check and per-redirect revalidation
// live in safeFetch, which checkUrl uses for the actual request.
export function isFetchableUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  return !hostLooksPrivate(u.hostname);
}

export type LinkVerdict = 'ok' | 'dead' | 'blocked';

export interface LinkCheck {
  url: string;
  verdict: LinkVerdict;
  status?: number;
}

/**
 * One request per URL: HEAD when the server allows it, GET when it doesn't.
 * Production goes through safeFetch (validates every redirect hop against the
 * private-network guard); tests inject a fetch to stay offline.
 */
export async function checkUrl(url: string, timeoutMs = 7000, fetchImpl?: typeof fetch): Promise<LinkCheck> {
  if (!isFetchableUrl(url)) return { url, verdict: 'blocked' };
  const attempt = async (method: 'HEAD' | 'GET') => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return fetchImpl
        ? await fetchImpl(url, { method, redirect: 'follow', signal: ctrl.signal })
        : await safeFetch(url, { method, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    let res = await attempt('HEAD');
    // plenty of servers refuse HEAD but serve GET perfectly well
    if (res.status === 405 || res.status === 501 || res.status === 403) res = await attempt('GET');
    return { url, verdict: res.ok ? 'ok' : 'dead', status: res.status };
  } catch {
    return { url, verdict: 'dead' };
  }
}

/** Human-readable summary written into the row's check column. */
export function summarize(checks: LinkCheck[]): string {
  if (!checks.length) return 'нет ссылок';
  const dead = checks.filter((c) => c.verdict === 'dead').length;
  const blocked = checks.filter((c) => c.verdict === 'blocked').length;
  if (dead === 0 && blocked === 0) return checks.length === 1 ? 'источник открылся' : `${checks.length} источника открылись`;
  const parts: string[] = [];
  if (dead) parts.push(`битых: ${dead}`);
  if (blocked) parts.push(`недопустимых: ${blocked}`);
  return `${parts.join(', ')} из ${checks.length}`;
}

/** Run checks with a small concurrency cap so one base can't stampede. */
export async function checkAll(urls: string[], limit = 6, check = checkUrl): Promise<Map<string, LinkCheck>> {
  const unique = [...new Set(urls)];
  const out = new Map<string, LinkCheck>();
  let i = 0;
  const worker = async () => {
    while (i < unique.length) {
      const url = unique[i++];
      out.set(url, await check(url));
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, unique.length) }, worker));
  return out;
}
