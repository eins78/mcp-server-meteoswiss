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
validation are all documented in `packages/meteoswiss-forecast-evals/docs/spec.md`.

## What shipped

- `packages/meteoswiss-forecast-evals/` — fixtures (2 real-captured, 1 deterministically
  synthesized 7-day, 1 synthesized multi-series mock in two candidate shapes), ground-truth
  computation, question generation, a lenient scorer (unit-tested), promptfoo configs for the
  programmatic and judge slices, a gate-table summarizer, and run scripts that read the
  OpenRouter key from the environment at runtime.
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

- [x] Full paid sweep (`pnpm run eval` + `eval:judge`, 13 models) — ran to completion after
      this PR was reviewed: 462 scheduled calls, 0 API errors. Full breakdown:
      `packages/meteoswiss-forecast-evals/docs/results/2026-07-09-forecast-json-comprehension.md`.
- [x] Cross-checked estimated cost against OpenRouter's own account API (promptfoo's own cost
      field is confirmed empty for OpenRouter — see
      `packages/meteoswiss-forecast-evals/docs/spec.md`).
- [x] Gate result: **keep local-time labeling — do not switch PR #99 to UTC.** See the results
      file above for the full evidence and verdict.

## Full sweep, PR Q&A, and review cycles (later in the same session)

Everything below happened after the checklist above, within the same overall session (multiple
context compactions occurred along the way — see `git log infra/forecast-json-evals` for the
full commit sequence).

- **Full paid sweep executed**: all 13 providers, 462 calls, 0 API errors (after Max added
  OpenRouter credits and disabled a ZDR/data-policy setting that had been blocking 2 Mistral
  models). Verdict: keep local-time labeling — confirmed across every tier and every model, no
  exceptions. Full breakdown:
  `packages/meteoswiss-forecast-evals/docs/results/2026-07-09-forecast-json-comprehension.md`.
- **PR Question A (`.mjs`/`.cjs` vs TypeScript) resolved**: promptfoo's docs recommend
  pre-transpiling assertion files, but that turned out to be just a recommendation — verified
  empirically with a throwaway `.ts` scorer against promptfoo's free `echo` provider before
  converting the real files. `scorer.cjs`/`scoring-core.mjs`/`synth-7day-fixture.mjs` became
  plain `.ts`, relying on Node's native TypeScript type-stripping (default since Node 23.6) —
  no build step needed. Full writeup: `packages/meteoswiss-forecast-evals/docs/spec.md` "Q-A".
- **PR Question B (promptfoo dependency bloat) resolved**: an initial `npx`-based approach was
  correctly flagged in review as not reproducible (pins only the top-level version, no lockfile
  integrity hashes). Investigated 5 pnpm mechanisms for "install this dependency only when
  explicitly used" (`optionalDependencies`, `--filter`, `shared-workspace-lockfile: false`,
  `dependenciesMeta`, a `.pnpmfile.cjs` hook) — all rejected with sources. The fix: exclude the
  eval package from the root pnpm workspace glob and give it its own nested
  `pnpm-workspace.yaml`, making it an independent, lockfile-pinned install. Full investigation:
  `packages/meteoswiss-forecast-evals/docs/spec.md` "Q-B (revisited)".
- **6 GitHub Copilot review comments addressed** (commit `bac829f`): 3 scorer-correctness bugs
  (one — a JSON-extraction multi-block recovery bug — actually moved committed pass-rate
  numbers, reconciled via a new zero-spend `summarize.ts --rescore` mode instead of a paid
  re-run), a fail-fast/determinism fix in ground-truth generation, a stale PR description, and a
  `pnpm-lock.yaml` regression revert.
- **Docs restructured** (commit `36f9c76`): the original `README.md` + `PLAN.md` (841 lines,
  mixing timeless methodology with dated findings) + `HANDOFF.md` (185-line recap) were split
  into a concise `README.md` entry point, `packages/meteoswiss-forecast-evals/docs/spec.md`
  (timeless methodology), and an immutable, dated
  `docs/results/2026-07-09-forecast-json-comprehension.md` — dated per Max's explicit request so
  a future rerun adds a new file instead of rewriting one and invalidating its inbound links.
  ~20 cross-references fixed across the codebase.
- **3 more Copilot review comments addressed** (commit `fa9d6e1`): a root `pnpm-lock.yaml`
  drift (2 orphaned `@swc/core` transitive deps plus 2 unrelated `semver` bumps, missed by the
  first surgical cleanup), this file's stale "Pending / follow-ups" checklist (fixed above), and
  an unpinned `npx tsx` shebang on the 7-day fixture generator script (switched to
  `node --import tsx`, matching the package's already-pinned `tsx` devDependency).

**Gotcha worth remembering**: diffing a long-lived feature branch against "main" for
PR-review-triage purposes must use `origin/main`, not a local `main` ref — local `main` was
~15 merged Renovate PRs stale, which initially made a real ~20-line lockfile diff look like a
1300-line one and nearly led to a much more invasive (and wrong) fix. Caught by comparing
`git rev-parse main origin/main` before trusting the diff.

## Final state

PR #100 has all 9 Copilot review comments addressed (6 in round 1, 3 in round 2), the full paid
sweep complete with a recorded verdict, and docs restructured. **Not merged** — that decision
belongs to Max. Latest commit on `infra/forecast-json-evals`: `fa9d6e1`.
