// Auto-pick a free OpenRouter model per request, with fallback. OPENROUTER_MODEL
// overrides. Model list fetched once and cached ~1h; empty on failure so the
// caller falls back to its heuristic rather than a paid model.
interface ORModel { id?: string; pricing?: { prompt?: string; completion?: string } }

export function pickFree(models: ORModel[]): string[] {
  return (models ?? [])
    .filter((m) => m?.id && m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0)
    .map((m) => String(m.id));
}

const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { ids: string[]; at: number } | null = null;

async function fetchFreeIds(): Promise<string[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: process.env.OPENROUTER_API_KEY ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } : {},
  });
  if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
  const data = await res.json();
  return pickFree(Array.isArray(data?.data) ? data.data : []);
}

/** Cached free model ids (~1h). Empty array on failure. */
export async function freeModelIds(): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.ids;
  try {
    const ids = await fetchFreeIds();
    cache = { ids, at: Date.now() };
    return ids;
  } catch (e) {
    console.error('free model list fetch failed:', e);
    return cache?.ids ?? [];
  }
}

/** Ordered candidate models for one request. OPENROUTER_MODEL overrides to a
 *  single fixed model; otherwise a shuffled slice of free models. Empty => the
 *  caller should fall back to its heuristic. */
export async function modelCandidates(limit = 6): Promise<string[]> {
  const override = process.env.OPENROUTER_MODEL?.trim();
  if (override) return [override];
  const ids = [...(await freeModelIds())];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, limit);
}

/** POST a chat completion, trying each candidate model until one responds OK.
 *  Returns { json, model } of the first success, or null if all fail. */
export async function openrouterChat(
  body: Record<string, unknown>,
  candidates: string[],
): Promise<{ json: unknown; model: string } | null> {
  for (const model of candidates) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://ai-reesearcher.vercel.app',
          'X-Title': 'AI-Researcher',
        },
        body: JSON.stringify({ ...body, model }),
      });
      if (res.ok) return { json: await res.json(), model };
    } catch (e) {
      console.error(`model ${model} failed, trying next:`, e);
    }
  }
  return null;
}
