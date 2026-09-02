import type { ColumnDef } from '../datasource/types';
import { coerceToNumber } from '../coerce';

// ScrapeGraphAI (https://scrapegraphai.com) turns a page URL into structured JSON
// from a prompt — no CSS/XPath. We call the cloud SmartScraper endpoint, asking
// it to extract rows shaped like the target base's columns, then map them in.
// Off unless SCRAPEGRAPHAI_API_KEY is set; SCRAPEGRAPHAI_MOCK=1 runs the whole
// flow without the network (for local testing).

// ScrapeGraphAI v2 «extract» endpoint (v1/smartscraper is deprecated and rejects
// v2 keys). Overridable via SCRAPEGRAPHAI_API_URL if the base ever moves again.
const API_BASE = process.env.SCRAPEGRAPHAI_API_URL || 'https://v2-api.scrapegraphai.com/api';
const ENDPOINT = `${API_BASE}/extract`;

export interface ScrapeStatus { enabled: boolean; mock: boolean; reason: string; }
export function scrapeStatus(env: Record<string, string | undefined> = process.env): ScrapeStatus {
  if (env.SCRAPEGRAPHAI_MOCK === '1') return { enabled: true, mock: true, reason: 'mock' };
  if (!env.SCRAPEGRAPHAI_API_KEY) return { enabled: false, mock: false, reason: 'SCRAPEGRAPHAI_API_KEY is not set' };
  return { enabled: true, mock: false, reason: 'enabled' };
}

const norm = (s: string) => s.trim().toLowerCase();
const userCols = (columns: ColumnDef[]) => columns.filter((c) => !c.key.startsWith('__') && c.label.trim());

// Ask the model to return one object per entity, fields named by our column
// labels — so the result maps straight onto the base.
export function buildPrompt(columns: ColumnDef[]): string {
  const labels = userCols(columns).map((c) => `"${c.label}"`);
  return (
    'Extract every distinct entity described on the page as a JSON array under the key "items". ' +
    `Each item is an object with exactly these fields: ${labels.join(', ')}. ` +
    'Use an empty string for a field that is not present on the page. Do not invent facts.'
  );
}

// Map SmartScraper's `result` onto base rows: find the array of items, then map
// each item's fields to columns BY LABEL, coercing numbers. Unknown fields drop.
export function resultToRows(columns: ColumnDef[], result: unknown): Record<string, unknown>[] {
  let items: unknown[] = [];
  if (Array.isArray(result)) items = result;
  else if (result && typeof result === 'object') {
    const arr = Object.values(result as Record<string, unknown>).find((v) => Array.isArray(v));
    items = arr ? (arr as unknown[]) : [result];
  }
  const byLabel = new Map(userCols(columns).map((c) => [norm(c.label), c]));
  return items
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object' && !Array.isArray(it))
    .map((it) => {
      const rec: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(it)) {
        const col = byLabel.get(norm(k));
        if (!col) continue;
        const raw = v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v);
        rec[col.key] = col.type === 'number' && raw.trim() !== '' ? coerceToNumber(raw) : raw;
      }
      return rec;
    })
    .filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== ''));
}

// canned result for SCRAPEGRAPHAI_MOCK=1 — one demo row shaped like the base
export function mockResult(columns: ColumnDef[], url: string): { items: Record<string, string>[] } {
  const cols = userCols(columns);
  const item: Record<string, string> = {};
  cols.forEach((c) => { item[c.label] = `demo ${c.label}`; });
  if (cols[0]) item[cols[0].label] = `Demo entity — ${url}`;
  return { items: [item] };
}

// Call the live v2 «extract» endpoint. Throws on a non-OK response or an API
// error. The structured data comes back under `json`; fall back to result/data.
export async function smartScrape(apiKey: string, url: string, prompt: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'SGAI-APIKEY': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ url, prompt }),
    signal,
  });
  const body = (await res.json().catch(() => ({}))) as { json?: unknown; result?: unknown; data?: unknown; error?: string; message?: string };
  if (!res.ok) throw new Error(`ScrapeGraphAI ${res.status}: ${body.error || body.message || res.statusText}`);
  if (body.error) throw new Error(`ScrapeGraphAI: ${body.error}`);
  return body.json ?? body.result ?? body.data ?? body;
}
