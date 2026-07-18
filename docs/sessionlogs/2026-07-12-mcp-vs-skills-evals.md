# MCP-vs-Skills Weather Q&A Evals

**Date:** 2026-07-11 to 2026-07-12
**Model:** Claude Fable 5 (worktree `evals-mcp-skills`, branch `evals-mcp-vs-skills`), autonomous session (Max away)
**PR:** [#131](https://github.com/eins78/meteoswiss-llm-tools/pull/131)

## Goal

Measure and visualize the difference between answering real-world Swiss weather questions
via (A) the MCP server's tools vs (B) the `meteoswiss-ogd` skill's direct HTTP/bash access,
on accuracy and token count/cost — real model calls, hard $5 OpenRouter cap, blog-quality
graphs, showcase-style writeup.

## What was built

Extension of `packages/meteoswiss-forecast-evals` (new `src/mcp-vs-skills/` track, reusing
the suite's promptfoo harness and conventions):

- Custom promptfoo providers wrapping an OpenRouter tool-calling agent loop.
  `provider-mcp.ts` connects an MCP SDK client to a locally started `meteoswiss-mcp`
  (real `tools/list` schemas + dispatch); `provider-skill.ts` injects the SKILL.md body
  and one guarded `bash` tool (`bash-tool.ts`: allowlisted read-only pipelines with
  recursive `$()` validation, MeteoSwiss-hosts-only URLs, 10 KB output cap, skill's
  bundled scripts runnable).
- 12 questions covering the whole tool surface (current x3, forecast x5, pollen x2,
  stations, climate), ground truth computed from live OGD data minutes before each run
  (`capture-ground-truth.ts`), tolerance-based programmatic scoring (no LLM judge).
- Budget guard: append-only spend ledger fed by OpenRouter's own `usage.cost`, hard abort
  at `MCP_SKILLS_BUDGET_USD` (default $4).
- `summarize.ts` (tables) + `render-charts.ts` (4 hand-rolled SVGs, CVD-validated
  palette) + results doc `docs/results/2026-07-12-mcp-vs-skills.md` written blog-style.

## Headline results (published sweep, 48 rows, $0.62)

- Accuracy: MCP 96% (23/24) vs skill 92% (22/24); haiku-4.5+MCP went 12/12.
- Tokens: MCP averaged ~20% FEWER tokens/question (16.8k vs 20.9k) despite fatter JSON —
  round trips dominate payload size (gpt-5-mini: 1.5 vs 4.0 tool calls/answer).
- Cost per correct answer: model choice dominates (gpt-5-mini ~0.2–0.33¢ vs haiku
  ~2.4–2.5¢); access method is a ~1.2x effect.
- Total session spend: $2.03 of the $5 cap (3 full sweeps + smoke while shaking out bugs).

## The eval caught a real skill bug

MeteoSwiss publishes each day's STAC forecast item before its assets upload; just after
midnight, the skill's documented "latest item by id" flow and `forecast.sh` selected the
empty item and returned `no_data` for everything. Fixed both (skip asset-less items) with
a `meteoswiss-skills` patch changeset. The MCP server was already immune.

## Fairness lessons (three sweeps to get an honest sandbox)

The first two sweeps unfairly penalized the skill method through eval-sandbox strictness,
each found by reading failing transcripts and fixed before the published run:

1. Backslash line continuations and `#` comments (models copy SKILL.md examples verbatim)
   were rejected by the bash guard.
2. `|| true` fallbacks split into an "empty pipeline segment"; apostrophes inside comments
   opened a phantom quote (comment stripping must precede quote masking).
3. Pollen answers quoting raw OGD param codes (`khpoacd1`) were scored wrong despite being
   factually right — codes are now scoring synonyms; the naming difference is reported as
   a qualitative finding instead.

Also: weekend-anchored questions broke when the capture straddled Sunday midnight
(next Saturday fell outside the 4-day forecast horizon) — questions now target the next
two calendar days with absolute dates; the climate question uses May 2026 because June's
monthly mean is published as an empty column until the month's row completes.

## Remaining genuine failures (kept, they're the findings)

- `mcp/gpt-5-mini` on "warmest station right now": MCP has no scan-all-stations tool
  (haiku brute-forced 13 calls / 79k tokens and passed). Suggested follow-up: a
  cross-station comparison tool.
- `skill/haiku` on Basel pollen types: read the stale `d0` CSV column instead of `d1`.
- `skill/gpt-5-mini` on Geneva sunshine: assumed shell env vars persist between bash
  calls (they don't, same as Claude Code) and burned its turns.

## Delivery / review loop

- PR #131, CI green on first push (all four checks).
- pr-review-toolkit agents (code-reviewer, silent-failure-hunter, pr-test-analyzer) ran on
  the diff; every accepted finding was fixed and re-pushed in one batch: bash-tool exit-code
  mapping for timeouts/spawn failures (had reported success — would bias the skill method),
  fail-loud on missing OpenRouter usage accounting (silent $0 rows would disable the budget
  guard and publish fake "free" measurements), guard end-runs closed (xargs dropped, curl
  write flags, non-https schemes, awk system()), error-row handling in summarize/charts,
  budget-guard tests + scoring/branching edge tests (81 offline tests total). Published
  tables and SVGs stayed byte-identical (zero error rows in the published run).
- Copilot review: requested twice; both attempts returned "user ... reached their quota
  limit" — Copilot did NOT review this PR. Max may want to re-request once quota resets.
  (/ai-review's gemini path is dead per standing memory, so no second-model review ran.)

## Notes for reruns

- `pnpm run mcp-skills:eval` re-captures ground truth and reruns everything (~$0.65);
  results are only comparable within one run. The spend ledger
  (`generated/.spend-mcp-skills.jsonl`, gitignored) accumulates across runs on purpose.
- OpenRouter key comes from env, `.env`, or macOS keychain `openrouter-evals`.
- promptfoo's `--filter-pattern` matches test descriptions (= question ids).
