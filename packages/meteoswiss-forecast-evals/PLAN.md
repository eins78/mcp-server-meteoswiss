# Plan: Forecast-JSON comprehension eval suite

This is the detailed design doc for `meteoswiss-forecast-evals`, written before implementation
and updated with what was actually found while building it. See `README.md` for the quick-start.

## Context

PR #99 added `precipitation.hourly: Array<{time, value}>` to `meteoswissLocalForecast` — a
time-series where each `time` is ISO-8601 in **local Europe/Zurich** with UTC offset
(`2026-03-28T09:00:00+01:00`). Before releasing this to PROD (and before adding MORE
time-series: sunshine, hourly wind/temp — see CLAUDE.md "Open Tasks"), Max wants **evidence**
that the JSON format is legible to the LLMs real end-users run — especially the small/cheap
ones. If the format confuses models, the schema/tool-description should be tweaked on the #99
branch *before* release, not after.

**Headline question (the gate):** does labeling hourly times in **local time (with offset)**
vs **UTC** measurably change whether models answer real-world local-time questions correctly —
most importantly on the **tiny tier** (haiku / gpt-5-mini / gpt-5-nano / gemini-flash-lite),
where a UTC->local conversion step is most likely to break and who real users actually use.
The UTC-vs-local result on that tier **gates merging #99 / releasing to PROD.**

## Decisions (locked)

- Stack: **promptfoo** (TS devDep). Considered inspect-ai (Python) on the merits — head-to-head
  covered in the session transcript; inspect-ai's real strengths (solver composition, epochs,
  agentic rigor) don't clear the bar for a single-turn comprehension matrix, and it would graft
  a second toolchain onto an otherwise TS-consistent monorepo. promptfoo's comparison-grid +
  native OpenRouter/Ollama providers fit this task directly.
- **New PR, based on `main`, independent of #99.** This package does not import `meteoswiss-mcp`
  source; `fixtures/` holds static JSON captured from a real run of the #99 tool (see below).
- Package: `packages/meteoswiss-forecast-evals`, a normal pnpm workspace member (no
  `pnpm-workspace.yaml` change needed — it's covered by the existing `packages/*` glob).
- **Not in CI.** Manual, documented reruns. OpenRouter key read from the macOS keychain at
  runtime, never hardcoded: `security find-generic-password -s OPENROUTER_API_KEY_EVALS -w`.
- Scoring: mostly **programmatic** (ground truth computed in TS from the same JSON the model
  sees) + a small **Opus judge** slice for open-ended quality. Lenient parsing separates
  "unparseable" from "wrong" so tiny models aren't penalized for JSON-formatting slips.
- Cost: lookup-slice providers disable OpenRouter reasoning
  (`passthrough.reasoning.enabled: false`) and cap `max_tokens: 256`. Target ~$4, hard ceiling
  $10. See "Cost" below for what the build-time smoke test actually confirmed.
- Multi-series mock (precip+sunshine+wind, two candidate shapes) = **secondary track**,
  clearly subordinate to the UTC-vs-local gate.

## Package layout

See README.md "Package layout" — kept in one place to avoid drift between the two docs.

## Fixture & the two variants (single source of truth)

`fixtures/forecast-8001-2day-local.json` and `fixtures/forecast-station-local.json` are **real
tool output**, captured by calling `getLocalForecast()` directly from
`packages/meteoswiss-mcp/src/data/ogd-local-forecast.ts` with `USE_TEST_FIXTURES=true` (postal
code `8001`/2 days, and station `Napf`/2 days) — the same fixture data
`test/integration/ogd-local-forecast.test.ts` uses, which happens to span the 2026-03-28 CET ->
2026-03-29 CEST daylight-saving transition. This is why it was picked as the primary fixture:
the DST offset flip is exactly the trap a UTC-only format would hide.

**Gotcha hit while capturing it**: `USE_TEST_FIXTURES` is read into a frozen module-level
constant at import time (`packages/meteoswiss-mcp/src/support/test-fixtures.ts`). Setting
`process.env.USE_TEST_FIXTURES = 'true'` at the top of a capture script does NOT work — ESM
import hoisting means the transitive import of that module (and its constant capture) happens
before any of the importing script's own top-level statements run. The first capture attempt
silently fell through to a **live network call** against real MeteoSwiss data instead of the
fixture. Fixed by setting the env var in the shell (`USE_TEST_FIXTURES=true npx tsx
capture.ts`) so it's set before the Node process even starts. Worth knowing for anyone writing
another one-off script against this codebase.

`src/fixture.ts` derives the **UTC variant** from the LOCAL one by re-rendering every
`hourly[].time` to its true UTC instant with a `Z` suffix (`new Date(iso).toISOString()`, not a
naive string substitution — verified in `ground-truth.test.ts`). Everything else in the JSON
(values, totals, weather, dates) is untouched, isolating the ablation to exactly one format
choice.

`src/ground-truth.ts` computes canonical readings (instant, local date, local hour, UTC offset)
by re-parsing each hourly entry's own timestamp — **not** by trusting the JSON's day-level
`date` grouping. Non-obvious finding: `groupPrecipByDate` in `ogd-local-forecast.ts` groups by
the **UTC** calendar date of the original reading, then converts each timestamp to local display
time — so the day object dated `"2026-03-28"` in the captured fixture actually contains an
hourly entry timestamped `"2026-03-29T00:00:00+01:00"`, which in local wall-clock terms is
already the next day. A consumer who assumes "a day object's `hourly[]` are that local day's
hours" will misattribute the last entry. Ground truth here re-buckets by each reading's own
parsed local date to stay unambiguous — and this mismatch itself might be worth a follow-up
question in a future revision of this suite.

**Deviation from the original rough plan, found while building**: a true `hourly: []` (empty
array, as opposed to `null`) case doesn't occur in the current implementation —
`groupPrecipByDate` always emits an entry for every fetched hour, including zero-rain hours. So
the "null vs empty-array" question became "`null` (station, truly unavailable) vs a
populated-but-all-zero array (postal code, dry day)" — the real distinction this codebase
produces — tested against day 2 of the primary fixture, which is genuinely dry with a populated
`hourly[]`.

## Question set (10 questions, programmatic)

All ground truth is computed by `src/ground-truth.ts` from the fixture — nothing below is
hand-typed. See `src/questions.ts` for exact prompt text and expected-value derivation.

| id | family | fixture | tests |
|----|--------|---------|-------|
| dry-2200 | point-bool | primary | point lookup, a dry hour |
| val-0800 | point-num | primary | point lookup, a rainy hour |
| commute-sum | range-num | primary | sum over an hour range (the "commute" framing) |
| commute-bool | range-bool | primary | any-rain over a range |
| argmax-hour | argmax-time | primary | which hour has the most rain |
| wettest-day | argmax-day | primary | which date has the most rain |
| total-consistency | cross-field | primary | declared total vs sum of hourly (rounding-tolerant) |
| dst-offset | dst-trap | primary | UTC offset at a specific local hour on the DST-transition day — **unanswerable from the UTC variant without correctly reasoning about CET/CEST**, by design; this is the sharpest test of the ablation |
| availability-day2 | availability | primary | populated-but-dry array vs fabricating a "no data" claim |
| station-null | null-handling | station | hallucination check: model must decline, not invent an hourly number for a station |

Plus two secondary-track questions on the 7-day fixture (`sevenday-wettest`,
`sevenday-afternoon-shower`) and five on the multi-series mock (see below) — 33 test cases
total from `pnpm run generate`.

Every test asks for a strict single-line JSON answer with a declared schema (e.g.
`{"mm": <number>}`). `src/scoring-core.mjs` parses leniently — strict JSON first, then a
markdown-fence strip, then a brace-matched extraction from surrounding prose — before falling
back to `unparseable`. This is unit-tested in `src/scoring.test.ts` and was also validated by
the real smoke-test run (see "What the smoke test found" below).

## Secondary track: 7-day fixture

`scripts/synth-7day-fixture.mjs` is a **deterministic, non-random** generator (see its header
comment for why: real fixture data only spans ~1.5 days, and this suite also needs to test
whether legibility holds up over a longer series — a proxy for "will consumers still cope once
we add more time-series over more days", the actual reason to eval now). Four hand-picked
hourly rain profiles are assigned to specific days of a week starting 2026-04-06 (a Monday,
safely after the DST transition the primary fixture already covers, so this fixture stays in
constant `+02:00` — its job is series *length*, not DST). Locked in by
`ground-truth.test.ts`.

## Secondary track: multi-series mock (shape A vs shape B)

`src/multiseries.ts` hand-authors a **mock** of a hypothetical future forecast shape combining
hourly precipitation + sunshine + wind — not anything `meteoswiss-mcp` emits today. Both
candidate container shapes are rendered from the *same* canonical hourly table (so their ground
truth is identical by construction):

- **Shape A — parallel arrays**: `precipitation.hourly[]` / `sunshine.hourly[]` / `wind.hourly[]`,
  each an independent `{time, value}` series (mirrors today's `precipitation.hourly` shape,
  repeated per parameter).
- **Shape B — unified per-hour objects**: one `hourly[]` array of `{time, precip_mm,
  sunshine_minutes, wind_kmh}` objects.

5 cross-series questions run identically against both. The build-time smoke test (1 tiny model)
already shows a directional signal — shape B scored 100% vs shape A's 90% — though n=5 per
shape is far too small to act on; a full run across more models/tiers is needed before this
should influence a real design decision.

## Open-ended judge slice

4 prompts (cyclist-commute, umbrella-tomorrow, compare-days, station-honesty) in
`promptfooconfig.judge.yaml`, graded by `openrouter:anthropic/claude-opus-4.8` via
`llm-rubric`. Each rubric's ground-truth facts are pulled from the same `ground-truth.ts`
functions the programmatic slice uses (via `generate-tests.ts`), not hand-typed, so the rubric
can't silently drift from the fixture. Run across one model per tier (opus / haiku / gpt-5-nano)
to bound cost — 12 graded calls total.

## Models + cost

Provider list in `promptfooconfig.yaml`, labeled `tier/short-name` (parsed by `summarize.ts` to
derive tier). Frontier: opus-4.8, sonnet-5, gpt-5.2, gemini-3.1-pro, mistral-large. Cheap:
haiku-4.5, gpt-5-mini, gemini-3.1-flash-lite, mistral-medium-3.1. **Tiny (the gate block)**:
gpt-5-nano, gemini-2.5-flash-lite, ministral-8b, llama-3.3-70b. Apertus (Swiss): confirmed
**absent from OpenRouter** as of 2026-07 — documented as an optional, commented-out local-Ollama
provider block (plain-chat only; its tool-calling template is broken but irrelevant here since
every prompt in this suite is plain chat).

### What the build-time smoke test found (real spend, ~$0.01, gemini-2.5-flash-lite only)

This isn't the real result — it's one tiny model on one run, used to validate the harness. But
it's worth recording because it's exactly the kind of signal this suite is built to surface:

```
GATE: tiny tier x {local, utc} — primary fixture
tiny | local     n=9  score=100%  [correct:9]
tiny | utc       n=9  score= 44%  [wrong:5 correct:4]
```

Broken down by family, the UTC variant scored 0% (not just lower — zero) on `point-bool`,
`point-num`, `range-num`, `argmax-time`, and `dst-trap`, while `range-bool`, `argmax-day`,
`cross-field`, and `availability` stayed at 100% on both variants. That pattern — precise
hour-level lookups collapsing under UTC while day-level/boolean/any-rain questions survive — is
plausible (hour-level lookups need an exact +1/+2h mental conversion the model visibly didn't
do reliably; day-level questions don't) and is the shape of evidence a real run should produce
at scale before anyone acts on it. One model, nine questions, is not that evidence yet.

### Cost tracking caveat (found empirically, not from docs)

promptfoo's own `row.cost` field came back `0` for all 33 real OpenRouter calls in the smoke
test, despite `tokenUsage` being populated correctly (2237 prompt + 11 completion tokens on the
first call, checked directly against the raw results JSON). promptfoo's OpenRouter provider
docs don't mention cost tracking at all — this isn't a missing config, it's just not wired up.
`summarize.ts` computes cost itself from `tokenUsage x` a hardcoded pricing table instead of
trusting promptfoo's field. The `passthrough.reasoning.enabled: false` cost control was also
verified for real: `tokenUsage.completionDetails.reasoning` was `0` on every smoke-test call, so
reasoning-token billing risk is confirmed mitigated for at least this model.

Estimated full-sweep cost at these token counts (~2.5k in / ~15-250 out per call depending on
reasoning behavior, 33 questions x 13 models): **~$2-3** for the programmatic sweep, **~$1-2**
for the judge slice. Comfortably under the $10 ceiling — still cross-check the real total
against [OpenRouter Activity](https://openrouter.ai/activity) once the full sweep runs, per the
caveat above.

## Reporting -> the gate

`pnpm run summarize` prints, in this order: (1) the tiny-tier x `{local, utc}` gate block, (2)
the full tier x variant table, (3) question-family x variant (the view that tells you *what*,
if anything, to fix — a family missed uniformly across tiers is a format defect; a family that
only weak models miss is a capability gap, not a format one), (4) the two secondary tracks, (5)
estimated cost. This feeds directly into: merge #99 as-is / tweak the format on #99 (or a
stacked follow-up PR if #99 has already merged) / hold the release.

## Branching

This PR is based on `main`, independent of #99 (per the fixture-capture approach above — no
source dependency). Any format tweak the evals justify lands on **PR #99** itself if still open,
or a stacked follow-up PR if #99 has already merged by then.

## Verification performed during the build (not the full paid run)

1. `pnpm run generate` — 33 programmatic + 4 judge test cases, 8 fixture JSON blobs, all
   committed under `generated/` for PR reviewability.
2. `pnpm test` — 29 offline unit tests (ground truth against the real captured fixture values,
   `toUtcIso` correctness including the DST boundary, and the lenient scorer across every leaf
   kind + compound + unparseable). All passing, no network.
3. `pnpm run dryrun` — promptfoo's built-in `echo` provider, $0, validated the full pipeline
   wiring end-to-end (including confirming `scorer.cjs`'s dynamic `import()` of the ESM
   `scoring-core.mjs` actually works under promptfoo's runtime, which was the biggest
   unverified-until-tested risk in the design).
4. `pnpm run smoke` — 1 real cheap model (gemini-2.5-flash-lite), ~$0.01, confirmed the real
   OpenRouter path, produced the gate-table finding above, and surfaced the cost-tracking
   caveat.
5. `pnpm -r lint` / `pnpm -r build` / `pnpm -r test` stay green across the monorepo; this
   package is not wired into any CI workflow.

**The full paid sweep across all 13 models (`pnpm run eval` + `eval:judge`) was deliberately
NOT run** — that's a separate, explicit step after this PR is reviewed.
