# Forecast-JSON Comprehension Eval Suite

**Date:** 2026-07-09
**Model:** Opus 4.8 (planning) / Sonnet 5 (execution), worktree `forecast-json-evals`, branch `infra/forecast-json-evals`
**Related:** [PR #99](https://github.com/eins78/meteoswiss-llm-tools/pull/99) (hourly precipitation), [issue #98](https://github.com/eins78/meteoswiss-llm-tools/issues/98)

## Motivation

PR #99 added `precipitation.hourly: Array<{time, value}>` to `meteoswissLocalForecast`, with
`time` in local Europe/Zurich with UTC offset. Before releasing this to PROD — and before
adding more time-series (sunshine, hourly wind/temp) — Max wanted evidence that the JSON format
is legible to the LLMs real end-users actually run, not just capable frontier models.

## Approach

Built `packages/meteoswiss-forecast-evals`, a standalone pnpm package (on a `main`-based branch,
independent of #99) using promptfoo. Headline design: pose concrete questions with objective
ground truth computed programmatically from the same JSON shown to the model (10 questions —
point lookups, range sums, argmax, cross-field consistency, a DST-offset trap, and a
hallucination check), scored deterministically with lenient parsing (separating "unparseable"
from "wrong" so tiny models aren't penalized for JSON formatting slips). A small Opus-judged
open-ended slice covers "explain this to a cyclist"-style quality on top.

The **headline A/B ablation**: the same fixture rendered with local-time-plus-offset timestamps
(what #99 ships) vs. the same instants rendered as bare UTC — run across every model tier, with
the **tiny tier's** result treated as the gate for merging #99 / releasing to PROD (real
end-users run cheap models, and a UTC->local conversion step is exactly where they're likely to
break).

Full design rationale, the fixture-capture gotcha (ESM import hoisting silently defeating a
`USE_TEST_FIXTURES=true` env-var set at the top of a script), the day-grouping-vs-local-date
subtlety found in `ogd-local-forecast.ts`, and the promptfoo-cost-field limitation found during
validation are all documented in `packages/meteoswiss-forecast-evals/PLAN.md`.

## What shipped

- `packages/meteoswiss-forecast-evals/` — fixtures (2 real-captured, 1 deterministically
  synthesized 7-day, 1 synthesized multi-series mock in two candidate shapes), ground-truth
  computation, question generation, a lenient scorer (unit-tested), promptfoo configs for the
  programmatic and judge slices, a gate-table summarizer, and run scripts that read the
  OpenRouter key from the macOS keychain at runtime.
- 29 offline unit tests (ground truth against real fixture values, DST math, scorer behavior
  across every leaf kind) — no network, not gated on API keys.
- Validated end-to-end with a $0 `echo`-provider dry run and a ~$0.01 real smoke test (1 cheap
  model) — **not** the full paid sweep, which is a deliberately separate, explicit next step.

## What the smoke test already found

One tiny model (gemini-2.5-flash-lite), one run: 100% accuracy on the local-time variant, 44%
on the UTC variant, with the gap concentrated entirely in hour-level lookups (point/range/argmax
questions collapsed to 0% under UTC; day-level and boolean questions were unaffected). Not a
result to act on yet — n=9 questions, one model — but exactly the shape of evidence a full run
across all 13 configured models should produce, and a working demonstration that the harness
surfaces real signal rather than noise.

## Verification

`pnpm -r lint`, `pnpm -r build`, `pnpm -r test` all green across the monorepo (`meteoswiss-mcp`:
174 passed, 1 pre-existing skip; `meteoswiss-forecast-evals`: 29 passed). Not wired into CI.

## Pending / follow-ups

- [ ] Full paid sweep (`pnpm run eval` + `eval:judge`, ~13 models, est. $2-4) — separate,
      explicit step after this PR is reviewed.
- [ ] Cross-check estimated cost against OpenRouter's own Activity dashboard once the full
      sweep runs (promptfoo's own cost field is confirmed empty for OpenRouter — see PLAN.md).
- [ ] Depending on the gate result: either merge #99 as-is, or tweak the local-time format /
      tool description on #99 (or a stacked follow-up PR) before release.
