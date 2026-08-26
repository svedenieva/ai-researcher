# Research evaluation — the measure before the engine

Before "the research got better" can mean anything, we measure it. This is step 1
of moving the research from the deeplink (Variant C) toward a stronger engine:
**get numbers first, change the engine second.**

## What we measure

A research answer is a set of rows in a run base. For a run we score:

| Metric | What it tells us | Cost |
|--------|------------------|------|
| **link rate** | share of rows citing a primary-source link | free |
| **quote rate** | share of rows with a non-trivial verbatim quote | free |
| **subtopic coverage** | share of the question's expected aspects touched | free |
| **empty rate** | share of rows with no name/quote/link — blanks left behind | free |
| **duplicate rate** | share of rows repeating a name already written | free |
| **quote-found rate** | share of quotes actually present on the page they cite | network (opt-in) |

`quote-found rate` is the honest one: inventing a plausible link is easy, a quote
that survives a search of the page is not. It's also the seed of the **verifier
pass** (roadmap step 5) — a row whose quote isn't on its page shouldn't count, and
eventually shouldn't be written.

## How to run a baseline (steps 1–2)

1. The question set lives in `lib/research/eval-set.ts` — 15 real questions with
   the subtopics a good answer covers. Grow or reshape it to what matters to you.
2. Run each question through the **current deeplink** (the normal flow): open your
   Claude, let it fill the run base.
3. Score the run base:

```
GET /api/research/eval?base=<runBaseId>&q=<questionId>&verify=1
```

Returns link/quote rates, subtopic coverage, and (with `verify=1`) the
quote-found rate. Record these — that's the baseline every later change is judged
against. The scorer is `lib/research/eval.ts` (unit-tested, offline metrics +
`quoteFoundOnPage`).

## The staged path (3–5) — and what it costs

Once there's a baseline, the engine can move in measured steps, each compared to
the baseline on the **same** metrics:

3. **One server agent, no delegation** — the same `deeplink.ts` prompt, but on our
   key, with web search. Buys repeatability and logs. **Scaffold is in the repo,
   behind a flag** (`lib/research/server-agent.ts`, route `POST /api/research/server`).
4. **Add a worker role** — self + one cheap researcher, subtopics in parallel.
5. **Verifier pass** — a separate check confirms each quote is on its page before
   the row is written (this doc's quote-found check, promoted to a gate).

Do **not** skip to step 4/5 before step 3 shows the single agent's numbers.

### Turning on step 3 (one env var over a key)

Off by default — it spends money, so it needs a key **and** an explicit flag:

```
ANTHROPIC_API_KEY=sk-ant-...     # the key that gets billed
RESEARCH_SERVER_AGENT=1          # explicit opt-in; a key alone won't do it
RESEARCH_MODEL=claude-sonnet-5   # optional; this is the default
```

Then `POST /api/research/server { "prompt": "<question>" }` creates a run base and
fills it server-side; score it with the same `/api/research/eval` call. `/api/research/start`
also returns `serverAgent: true` once the flag is on, so a UI can offer the server
run beside the deeplink. v0 limits (honest): single agent, Anthropic's server-side
`web_search` only (not our MCP connector yet), and just the three seeded columns —
it does not add topic-shaped columns the way a user's Claude does. Its **first real
run is what produces the step-3 baseline numbers** — until then the numbers are
unknown, not assumed.

## Honest gaps (unknowns, not decisions)

- **Cost is unmeasured.** Rates are public; our runs/month and average read volume
  aren't. Only a first measured run at step 3 gives the order of magnitude.
  Multi-agent runs use ~15× the tokens of a chat and only pay off when the answer
  is expensive by itself.
- **Multi-agent gain on _our_ questions is unproven.** The 90.2% figure is
  Anthropic's benchmark, not ours — that's exactly what the baseline is for.
- **Our MCP under a server agent is untested.** A client Claude hits the connector
  at human pace; parallel workers don't. `maxDuration` and `add_rows` under
  concurrent writes haven't been load-tested. (Vercel caps functions at 800s, 1800s
  in beta — a server agent would need that raised from the current default.)

## Sources

- Anthropic — *When to use multi-agent systems (and when not to)* (orchestrator/worker, 90.2%, ~15× tokens).
- Anthropic Help Center — API for individual use; Claude Code legal & compliance (OAuth subscriptions are personal-use; products use an API key).
- Vercel — Configuring Maximum Duration; Functions Limits (800s / 1800s beta).
- Platform Claude — Multiagent orchestration (rosters, threads, delegation limits).
- Code: `lib/research/deeplink.ts`, `lib/research/decompose.ts`, `app/api/research/start/route.ts`, `app/research/page.tsx`, `app/api/mcp/route.ts`, and this harness (`lib/research/eval.ts`, `lib/research/eval-set.ts`, `app/api/research/eval/route.ts`).
