// Roadmap step 3 — "one server agent, no delegation" — behind a flag.
//
// The default research flow is Variant C: the site opens the USER's own Claude
// via a deeplink and their subscription does the work (Anthropic forbids third
// parties from spending someone else's subscription). This file is the *other*
// path: the same research prompt, but run on OUR Anthropic API key, server-side,
// so a run is repeatable and logged. It is OFF by default and spends money when
// on — hence a deliberate two-part switch, not a single stray key.
//
// Enable with BOTH:
//   ANTHROPIC_API_KEY=sk-ant-...        (the key that gets billed)
//   RESEARCH_SERVER_AGENT=1             (explicit opt-in; a key alone won't do it)
// Optional:
//   RESEARCH_MODEL=claude-sonnet-5      (default below)
//
// This is a v0 scaffold: single agent, Anthropic's server-side web_search, and a
// `save_rows` client tool that writes into the three seeded run-base columns
// («Название»/«Цитата»/«Источники»). It does NOT yet add topic-shaped columns or
// call our MCP connector the way a user's Claude does — those are step 3b/4. The
// pure helpers (status, pluckSavedRows, dedupeRows) are unit-tested; the live
// model loop is only exercised once the flag is on, and its first real run is the
// thing that produces the step-3 numbers the eval harness scores.

import type { CustomStore } from '@/lib/datasource/customStore';
import { researchInstruction } from './deeplink';

export interface ServerAgentStatus {
  enabled: boolean;
  reason: string;
}

/** Whether the server-side research path is switched on (key AND explicit flag). */
export function serverAgentStatus(env: Record<string, string | undefined> = process.env): ServerAgentStatus {
  const hasKey = !!env.ANTHROPIC_API_KEY;
  const flag = env.RESEARCH_SERVER_AGENT === '1';
  if (!hasKey && !flag) return { enabled: false, reason: 'no ANTHROPIC_API_KEY and RESEARCH_SERVER_AGENT is not 1' };
  if (!hasKey) return { enabled: false, reason: 'RESEARCH_SERVER_AGENT=1 but ANTHROPIC_API_KEY is missing' };
  if (!flag) return { enabled: false, reason: 'ANTHROPIC_API_KEY is set but RESEARCH_SERVER_AGENT is not 1' };
  return { enabled: true, reason: 'enabled' };
}

// ── pure helpers (testable without the network) ─────────────────────────────

export interface SavedRow {
  name: string;
  quote: string;
  source: string;
}

type ContentBlock =
  | { type: 'tool_use'; name: string; id: string; input?: unknown }
  | { type: string; [k: string]: unknown };

/** Collect the rows from every `save_rows` tool call in one response's content. */
export function pluckSavedRows(content: ContentBlock[] | undefined): SavedRow[] {
  const out: SavedRow[] = [];
  for (const block of content ?? []) {
    if (block.type !== 'tool_use' || (block as { name?: string }).name !== 'save_rows') continue;
    const rows = (block as { input?: { rows?: unknown } }).input?.rows;
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const o = (r ?? {}) as Record<string, unknown>;
      out.push({
        name: str(o.name ?? o['название'] ?? o.title),
        quote: str(o.quote ?? o['цитата']),
        source: str(o.source ?? o.url ?? o['источники']),
      });
    }
  }
  return out;
}

/** Drop nameless rows and collapse case-insensitive name duplicates (keep first). */
export function dedupeRows(rows: SavedRow[]): SavedRow[] {
  const seen = new Set<string>();
  const out: SavedRow[] = [];
  for (const r of rows) {
    const key = r.name.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

// ── the live loop (only runs when the flag is on) ───────────────────────────

const SAVE_ROWS_TOOL = {
  name: 'save_rows',
  description:
    'Save one or more result rows into the run base. Call this as you confirm facts. ' +
    'Every row needs a verbatim quote from its primary source and a direct link to that source.',
  input_schema: {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'the object / fact / point (goes in «Название»)' },
            quote: { type: 'string', description: 'verbatim sentence(s) from the source (goes in «Цитата»)' },
            source: { type: 'string', description: 'direct URL to the primary source (goes in «Источники»)' },
          },
          required: ['name', 'quote', 'source'],
        },
      },
    },
    required: ['rows'],
  },
} as const;

export interface ServerResearchResult {
  ok: boolean;
  reason: string;
  added: number;
  rows: SavedRow[];
  turns: number;
}

export interface RunServerResearchArgs {
  topic: string;
  baseId: string;
  store: CustomStore;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  maxTurns?: number;
  signal?: AbortSignal;
}

/**
 * Run the single server agent for one research question and write its rows into
 * the run base. Guarded: returns `{ ok:false }` unchanged if the flag is off, so
 * importing/calling this in a disabled deployment costs nothing.
 */
export async function runServerResearch(args: RunServerResearchArgs): Promise<ServerResearchResult> {
  const env = args.env ?? process.env;
  const status = serverAgentStatus(env);
  if (!status.enabled) return { ok: false, reason: status.reason, added: 0, rows: [], turns: 0 };

  const fetchImpl = args.fetchImpl ?? fetch;
  const model = env.RESEARCH_MODEL || 'claude-sonnet-5';
  const maxTurns = args.maxTurns ?? 8;
  const instruction = researchInstruction(args.topic, args.baseId);

  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
    SAVE_ROWS_TOOL,
  ];

  // messages carry the running transcript; save_rows tool_results close each loop
  const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
    { role: 'user', content: instruction },
  ];
  const collected: SavedRow[] = [];
  let turns = 0;

  for (; turns < maxTurns; turns++) {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: args.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY as string,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 4096, tools, messages }),
    });
    if (!res.ok) {
      const detail = await safeText(res);
      return { ok: false, reason: `anthropic ${res.status}: ${detail.slice(0, 200)}`, added: collected.length, rows: collected, turns };
    }
    const data = (await res.json()) as { content?: ContentBlock[]; stop_reason?: string };
    const content = data.content ?? [];

    const saved = pluckSavedRows(content);
    collected.push(...saved);

    if (data.stop_reason !== 'tool_use') break; // end_turn / max_tokens / stop — we're done

    // answer every client tool_use with a tool_result so the model can continue
    const toolResults = content
      .filter((b) => b.type === 'tool_use' && (b as { name?: string }).name === 'save_rows')
      .map((b) => ({
        type: 'tool_result' as const,
        tool_use_id: (b as { id: string }).id,
        content: 'saved',
      }));
    if (toolResults.length === 0) break; // model paused on a server tool only; nothing for us to answer
    messages.push({ role: 'assistant', content });
    messages.push({ role: 'user', content: toolResults });
  }

  const rows = dedupeRows(collected);
  let added = 0;
  if (rows.length) {
    added = await args.store.addRecords(
      args.baseId,
      rows.map((r) => ({ 'название': r.name, 'цитата': r.quote, 'источники': r.source })),
    );
  }
  return { ok: true, reason: 'done', added, rows, turns };
}

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ''; }
}
