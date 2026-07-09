# Forecast-JSON comprehension eval — results (2026-07-09)

This file is **immutable** — it records what one specific set of runs found on this date. See
[`../../README.md`](../../README.md) for the current headline verdict and quick-start, and
[`../spec.md`](../spec.md) for the methodology/design these runs exercised. A future rerun adds a
new dated file under `docs/results/` rather than editing this one, so links into this file never
go stale.

## What the build-time smoke test found (real spend, ~$0.01, gemini-2.5-flash-lite only)

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

## Verification performed during the build (not the full paid run)

1. `pnpm run generate` — 33 programmatic + 4 judge test cases, 8 fixture JSON blobs, all
   committed under `generated/` for PR reviewability.
2. `pnpm test` — 29 offline unit tests (ground truth against the real captured fixture values,
   `toUtcIso` correctness including the DST boundary, and the lenient scorer across every leaf
   kind + compound + unparseable). All passing, no network.
3. `pnpm run dryrun` — promptfoo's built-in `echo` provider, $0, validated the full pipeline
   wiring end-to-end (including confirming `scorer.ts`'s dynamic `import()` of `scoring-core.ts`
   actually works under promptfoo's runtime, which was the biggest unverified-until-tested risk
   in the design — see [`../spec.md`](../spec.md) "Q-A" for the full story of why that's a plain
   `.ts` file today).
4. `pnpm run smoke` — 1 real cheap model (gemini-2.5-flash-lite), ~$0.01, confirmed the real
   OpenRouter path, produced the gate-table finding above, and surfaced the cost-tracking
   caveat (see [`../spec.md`](../spec.md) "Cost tracking caveat").
5. `pnpm -r lint` / `pnpm -r build` / `pnpm -r test` stay green across the monorepo; this
   package is not wired into any CI workflow.

The full paid sweep across all 13 models was subsequently run — see "Full sweep results
(2026-07-09)" below for the outcome, the account-funding blocker that limited it, and the
resulting (partial but statistically clean) verdict.

## Full sweep results (2026-07-09)

**Cost: ~$0.32 actually spent** (verified against OpenRouter's own account API, not promptfoo's
internal cost field — see [`../spec.md`](../spec.md) "Cost tracking caveat"). Well under the
$2-4 target and the $10 hard ceiling. The sweep did **not** complete cleanly, though — 61.9% of
the 462 scheduled calls (286 rows) came back as real API errors rather than model answers.
Root-caused (systematic debugging, not guessed) to **three independent, unrelated causes**, none
of which are eval-suite bugs in the harness itself:

1. **Dominant cause — this OpenRouter account has never purchased credits.**
   `GET /api/v1/auth/key` reports `"limit": 10, "limit_remaining": 9.66, "is_free_tier": true`;
   `GET /api/v1/credits` reports `"total_credits": 0`. The `$10` figure is a *per-key spend cap*
   that would apply once the account has a real prepaid balance — it is not itself spendable
   money. Free-tier accounts draw against a much smaller complimentary balance for metered usage,
   and this run exhausted it partway through (concurrency=4, 13 models spending simultaneously):
   `402 "Insufficient credits. This account never purchased credits."` hit 7 of 13 providers,
   always on their *later*-scheduled test cases (7-day/station/multi-series fixtures), never on
   the very first (primary-fixture) calls — consistent with "ran out partway through," not a
   per-request limit. **Action needed from Max: add real credits to the OpenRouter account** at
   <https://openrouter.ai/settings/credits> before a complete, all-13-provider rerun — this is a
   billing action outside what a coding session should do unprompted.
2. **`mistralai/mistral-large-2512` and `mistralai/mistral-medium-3.1`: 100% failure**, unrelated
   to credits — `404 "No endpoints available matching your guardrail restrictions and data
   policy. Configure: https://openrouter.ai/settings/privacy"`. An account-level privacy/data-
   policy setting on OpenRouter excludes these two endpoints entirely. **Action needed from Max:
   toggle the relevant setting at that URL**, or accept these two EU frontier/cheap-tier
   providers stay excluded from this suite.
3. **`gpt-5-mini`, `gpt-5-nano`, `gemini-3.1-pro-preview`, `gpt-5.2`: 100% failure**, also
   unrelated to credits exhaustion (all four failed even on their very first, primary-fixture
   call) — these four reject this suite's cost-control config outright. Three returned
   `400 "Reasoning is mandatory for this endpoint and cannot be disabled"` in response to
   `passthrough.reasoning.enabled: false`; `gpt-5.2` returned a distinct `402 "This request
   requires more credits... You requested up to 65536 tokens, but can only afford 2708"` —
   meaning it silently ignored `max_tokens: 256` and reserved a huge hidden reasoning-token
   budget instead of refusing outright. **Fixed in this PR**: `promptfooconfig.yaml` now gives
   these four `passthrough: { reasoning: { effort: 'minimal' } }` instead of `enabled: false` —
   the lowest reasoning budget these endpoints accept, rather than trying to disable reasoning
   entirely. Not yet re-verified against a live call (would need real credits — see #1).
   **Caveat for the rerun**: gpt-5.2's error text ("requested up to 65536 tokens") looks less
   like a reasoning-budget problem and more like `max_tokens: 256` not being applied to that
   endpoint at all — 65536 reads like an unconstrained default ceiling, not a reasoning-effort
   side effect. Once real credits are added, the 402 will likely disappear regardless (small
   enough balance no longer being the binding constraint), which would make this *look* fixed
   without confirming `max_tokens` actually caps gpt-5.2's completion length. On rerun, check
   gpt-5.2's `tokenUsage.completion` in `generated/results.json` stays near 256, not just that
   the call succeeds — otherwise this one provider could quietly cost far more per call than the
   rest of the sweep.

**The headline verdict, from the 7 providers that did complete cleanly** (all 3 tiers
represented — frontier: opus-4.8, sonnet-5; cheap: haiku-4.5, gemini-3.1-flash-lite; tiny:
gemini-2.5-flash-lite, llama-3.3-70b, ministral-8b — 18/18 or 27/27 API-successful calls each on
the primary, DST-spanning fixture):

```
tier      variant   accuracy
frontier  local     18/18  100.0%
frontier  utc       11/18   61.1%
cheap     local     18/18  100.0%
cheap     utc        9/18   50.0%
tiny      local     25/27   92.6%
tiny      utc       12/27   44.4%
```

By question family, the pattern is uniform across every tier — including frontier — which per
this doc's own reporting rule ("a family missed uniformly across tiers is a format defect, not a
capability gap") is a clean signal. One family needs to be pulled out before drawing that
conclusion, though: `dst-trap` asks for the UTC offset at a specific local hour (`+02:00`), which
the local-variant JSON prints literally and the UTC-variant JSON structurally omits — the prompt
also forbids outside knowledge. That question is **definitionally unanswerable from the UTC
variant by design** (see [`../spec.md`](../spec.md) "Question set"), so its 0% UTC score is
expected and shouldn't be read as a comprehension failure on its own. Excluding it:

- **Day-level / boolean-only questions** (`argmax-day`, `availability`, `cross-field`,
  `range-bool`) stay at or near 100% on **both** variants, every tier.
- **`point-num` and `range-num`** (exact-value and range-sum lookups at a specific local hour) —
  the cleanest, non-rigged evidence — score **100% local / 0% UTC in every single tier**,
  frontier included (`opus-4.8`/`sonnet-5` both `2/2` local, `0/2` UTC). These questions are
  fully answerable from either variant's JSON in principle; the only difference is whether the
  model has to convert a UTC instant to the Europe/Zurich wall-clock hour before doing the
  lookup, and it essentially never gets that conversion right.
- **`argmax-time`** (which local hour had the most rain) shows the same direction, though less
  absolute: `0/2` cheap and `0/3` tiny, but frontier only drops to `1/2` (50%) rather than `0/2`
  — still a large regression from its 100% local score, just not as total as point-num/range-num.
- `dst-trap`, once understood as structurally rigged rather than a capability signal, is
  consistent with (not separate evidence for) the same story: local time survives because the
  offset is printed; UTC can't, by construction.

Two distinct mechanisms are both at work here, worth keeping separate: local time removes an
error-prone UTC→local conversion step from every hour-level *value* lookup (point-num,
range-num, argmax-time), and separately makes the UTC offset itself directly readable rather
than requiring calendar/DST knowledge the prompt explicitly disallows (dst-trap).

**This partial-sample verdict was: keep local-time labeling, do not switch to UTC** — see below
for the complete 13-provider rerun, which confirms it and strengthens the evidence.

## Full sweep results, complete (2026-07-09, after credits + ZDR fix)

Max added real OpenRouter credits and disabled the account's ZDR (data-policy/guardrail) setting
that had been blocking the two Mistral endpoints. Rerun of the full sweep: **all 13 providers
completed with 0 API errors** (462 total scheduled calls; `Results: 0 errors (0%)` in the
promptfoo CLI summary) — every failure below is a real scoring outcome (wrong/unparseable), not
an infrastructure failure. All three root causes from the partial run are confirmed fixed:
credits exhaustion (resolved by the top-up), the Mistral 404 guardrail (resolved by the ZDR
toggle — both `mistral-large-2512` and `mistral-medium-3.1` completed all 33 calls each, no
different from any other provider), and the four reasoning-config rejections (resolved by
`passthrough.reasoning.effort: 'minimal'` — see the caveat on `gemini-3.1-pro-preview` below,
which needed one more round of investigation).

**Gate (tiny tier, primary DST-spanning fixture) — decides #99 / PROD release:**

```
tiny | local   n=36  score=86%  [wrong:5 correct:31]
tiny | utc     n=36  score=46%  [wrong:19 correct:16 partial:1]
```

**All tiers × variant, primary fixture:**

```
tier      variant   n    score
cheap     local     36   100%  [correct:36]
cheap     utc       36    54%  [correct:19 wrong:15 unparseable:1 partial:1]
frontier  local     45    93%  [correct:42 unparseable:3]
frontier  utc       45    58%  [wrong:17 correct:26 unparseable:2]
tiny      local     36    86%  [wrong:5 correct:31]
tiny      utc       36    46%  [wrong:19 correct:16 partial:1]
```

**Question family × variant, primary fixture (n=13 per cell — the full set, not a partial
sample):**

```
family          local   utc
argmax-day       92%    92%   (date-level, both variants encode it identically — expected)
argmax-time     100%    15%
availability     92%    88%
cross-field     100%    88%
dst-trap         85%    15%   (structurally unanswerable from UTC by design — see below)
point-bool       85%    69%
point-num       100%     8%
range-bool      100%   100%   (coarse yes/no across a labeled range — robust either way)
range-num        85%     0%
```

The full sample confirms and sharpens the partial-run finding. **`point-num` and `range-num`**
remain the cleanest, non-confounded evidence — exact-value and range-sum lookups at a specific
local hour — now at **100% local / ~0% UTC across the complete 13-provider, n=13-per-cell sample**,
not just a 7-provider subset. (`point-num` UTC is 8%, not a flat 0% — one `gpt-5.2` response out of
13 correctly converted 08:00 local to 07:00 UTC and answered right; see "Copilot review fixes"
below for how this single-row correction was found and verified. `range-num` UTC stays a flat 0%,
untouched by that fix.) `argmax-time` shows the same collapse (100% → 15%). `dst-trap`
stays excluded from the headline claim for the same reason as before: it asks for the UTC offset
itself, which the local-variant JSON prints literally and the UTC-variant JSON structurally
cannot express — its near-zero UTC score is expected by construction, not new comprehension
evidence. **`argmax-day` and `range-bool` show no gap at all** — a genuinely new nuance the
partial sample didn't have the range to surface clearly: coarse day-level and yes/no-across-a-
range questions don't require converting a specific hour, so they're insensitive to the
labeling choice. The comprehension gap is specifically about pinning down *a particular hour's*
value, not about the format being confusing in general.

**Per-model breakdown, primary fixture (n=9 per cell, every one of the 13 real providers)** —
every single model, no exceptions, scores higher on local than UTC:

```
provider                          local   utc
claude-opus-4.8                    100%    67%
claude-sonnet-5                    100%    56%
claude-haiku-4.5                   100%    44%
gemini-3.1-pro-preview              67%    22%   (see caveat below — inflated by a truncation bug)
gemini-3.1-flash-lite               100%    56%
gemini-2.5-flash-lite               100%    44%
gpt-5.2                             100%    78%
gpt-5-mini                          100%    56%
gpt-5-nano                          67%    44%
mistral-large-2512                  100%    67%
mistral-medium-3.1                  100%    56%
ministral-8b-2512                    89%    33%
llama-3.3-70b-instruct               89%    56%
```

**Surprising finding, investigated and explained:** `gemini-3.1-pro-preview` is the one outlier
that doesn't score ~100% on local. Traced (not guessed) by reading its raw failing responses in
`generated/results.json`: on **local**, all 3 failures are `[unparseable] no JSON object
recovered from response` — the model emits a visible `"Thinking: ..."` preamble (a side effect of
`reasoning.effort: 'minimal'` still leaking some reasoning tokens into the completion, matching
`summarize.ts`'s own `[!] reasoning tokens leaked: 7612` flag for this provider) that consumes
the `max_tokens: 256` budget before the actual JSON answer, truncating mid-response (e.g.
`{"utc_offset": "+02:00` cut off with no closing brace). This is an eval-harness token-budget
artifact, not a comprehension failure — the model was mid-way through emitting the *correct*
answer when it ran out of budget in two of the three cases inspected. On **UTC**, by contrast,
6 of 8 failures are genuine wrong answers (e.g. "expected 0.3±0.05, got 0.5") in the same pattern
as every other model, plus 2 more truncation artifacts. Net effect: this provider's local score
(67%) understates its real comprehension (which is likely ~100%, consistent with every other
frontier model, once truncation is excluded), while its UTC score (22%) is a mix of real
misunderstanding and the same artifact. **Does not change the verdict** — if anything, correcting
for the artifact would widen this model's local-vs-UTC gap, not narrow it. Flagged here rather
than silently adjusted, since fixing `max_tokens` for this one provider is a config change for a
future PR, not something to patch mid-report.

No other provider — including both previously-blocked Mistral models — shows any anomaly relative
to the rest of its tier. The Mistral models track their tier peers closely (`mistral-large-2512`
100%/67% local/utc, right in line with `opus-4.8`; `mistral-medium-3.1` 100%/56%, in
line with `haiku-4.5`/`gpt-5-mini`; `ministral-8b-2512` 89%/33%, in line with the other tiny-tier
models) — the earlier 404 guardrail block was purely an account setting, not a sign these models
handle the format differently.

**Judge slice** (`pnpm run eval:judge`, open-ended prompts judged by `opus-4.8` via
`llm-rubric`): **12/12 passed (100%)**, 0 errors, across all 3 judged providers
(`opus-4.8`, `haiku-4.5`, `gpt-5-nano`) — confirms the local-time format supports genuinely
useful, non-hallucinating, timing-aware answers in open-ended use (e.g. "explain to a cyclist
planning an 08:00 commute"), not just the programmatic lookup slice.

**Secondary tracks** (directionally consistent, not part of the headline gate):
- 7-day fixture: frontier 90%/60% local/utc, cheap 75%/50%, tiny 50%/50% (n=8 per tier-variant
  cell — small enough that the flat tiny-tier result is plausibly noise, not a contradiction).
- Multi-series mock (shape A vs shape B, secondary design input for a *future* sunshine/wind
  feature, not this PR's gate): shape B slightly ahead of shape A in cheap/tiny tiers (88%/72%
  vs 85%/77%), roughly even in frontier (80% vs 82% — corrected from 76%/78% after the
  `extractJson` fix below rescued a `gpt-5.2` row on each shape; still a mild signal, not a
  strong one either way). **Superseded by a conclusive run — see "Multi-series eval, expanded"
  below**, which does not share this data point (different, dedicated 5-provider run, no
  `gpt-5.2`) and is unaffected by this fix.

**Cost — actual, verified against OpenRouter's own account API** (not promptfoo's internal cost
field, confirmed non-functional for OpenRouter — see [`../spec.md`](../spec.md) "Cost tracking
caveat"): account usage before this rerun was `$0.335` (the earlier partial 7/13 sweep); after
the full 13-provider sweep + judge slice, `$1.289`. **This rerun's actual spend: ~$0.95** (eval
sweep + judge slice combined), comfortably under the $2-4 target and the $10 hard ceiling —
confirmed via `GET https://openrouter.ai/api/v1/auth/key` (`usage` field) and `GET
https://openrouter.ai/api/v1/credits`, cross-checked against `summarize.ts`'s own token-based
estimate (~$1.07 for the eval sweep alone) — same order of magnitude, real API confirms the
estimate isn't wildly off.

**Verdict: keep local-time labeling (PR #99 as shipped). Do not switch to UTC. Confirmed, not
just carried over, by the complete 13-provider rerun.** The core, non-confounded evidence
(`point-num`/`range-num`) is unchanged in direction and now covers the full sample: 100% local /
~0% UTC (one single-row exception on `point-num`, see "Copilot review fixes" below — does not
change the direction or the verdict), every tier, every one of the 13 real models included. No
provider — including the two
previously-blocked Mistral endpoints — bucks the trend. The one apparent outlier
(`gemini-3.1-pro-preview`'s depressed local score) traces to an eval-harness token-budget
artifact, not a comprehension counterexample, and correcting for it would strengthen rather than
weaken the finding. The judge slice adds an open-ended, non-programmatic confirmation that the
local-time format produces useful answers, not just correct programmatic-lookup answers.

**Local-format cleanliness check** (this suite's secondary purpose — catching defects in the
*local* format before release, independent of the UTC comparison): tiny tier scored 86% (31/36)
on local this run, similar to the partial run's 92.6%. Failures are `wrong:5`, still scattered
across different models/families per the per-model table above (no single model or question
family dominates tiny-tier local failures) — read as ordinary model noise at the tiny-tier
capability floor, not a local-format defect worth acting on before release.

### Both blockers from the previous partial run are now resolved

1. **OpenRouter credits added by Max** — the account is no longer `is_free_tier`. All 13
   providers completed with 0 API errors this run (previously 61.9% error rate from free-tier
   exhaustion).
2. **ZDR/data-policy setting disabled by Max** — both `mistral-large-2512` and
   `mistral-medium-3.1` completed all 33 calls each this run (previously 100% failure with
   `404 "No endpoints available matching your guardrail restrictions"`).
3. **The `passthrough.reasoning.effort: 'minimal'` fix works** for all four previously-rejecting
   models (`gpt-5-mini`, `gpt-5-nano`, `gemini-3.1-pro-preview`, `gpt-5.2`) — no more 400/402s.
   One residual nuance: `gemini-3.1-pro-preview` still leaks a little visible reasoning text into
   its completions, occasionally truncating the JSON answer under the tight `max_tokens: 256`
   budget — see the trace above. Doesn't change the verdict; flagged as a possible follow-up
   (raise `max_tokens` for this one provider) rather than fixed here, since it doesn't block the
   gate decision. (Subsequently done — see "Multi-series eval, expanded" below, which gave this
   provider its own `max_tokens: 1024` config and confirmed the fix.)

## Copilot review fixes (2026-07-09)

GitHub Copilot left 6 review comments on PR #100, covering three scorer-correctness bugs, a
fail-fast/determinism gap in ground-truth generation, a stale PR description, and unrelated
root-lockfile churn. All six are fixed on this branch. Two of the three scorer fixes are provably
**score-neutral** against every real response already on disk; one is not, and its effect on the
committed tables above is reconciled here at **zero additional API spend**.

- **`extractJson` multi-block recovery** (`src/scoring-core.ts`) — SCORE-AFFECTING. The old
  first-`{`-to-last-`}` slice spans multiple JSON-ish blocks and fails to parse when a model's
  response contains more than one (e.g. a reasoning leak with a brace in prose, followed by the
  real trailing answer). Replaced with a balanced-brace scanner that tries each top-level block,
  last-first. This is a strict superset of the old attempts, so no currently-passing row can
  regress — verified against every failing row in every committed `generated/results*.json`: only
  3 rows flip, all `gpt-5.2`, all fail→pass (`generated/results.json`: `val-0800` UTC, and
  `ms-argmax-sunshine` on both multiseries shapes — see below for the exact effect on each table).
- **`unavailable` hallucination check** (`src/scoring-core.ts`) — score-neutral. Now requires an
  explicit decline (`hourly_available: false`) AND no fabricated `mm`, rejecting both
  `{"hourly_available": true, "mm": 2}` (already rejected) and the two cases that previously slipped
  through: `{"mm": 2}` (bare fabrication, no flag at all) and `{"hourly_available": false, "mm": 2}`
  (mixed signal). Verified against all 13 real `station-null` responses in `generated/results.json`:
  every one was a clean `{"hourly_available": false}` — 0 rows flip.
- **`coerceHour` ISO-timestamp safety** (`src/scoring-core.ts`) — score-neutral. Now prefers a
  clock (`HH:MM`) pattern over a bare 1-2 digit run, so a full ISO timestamp (e.g.
  `"2026-03-28T09:00:00+01:00"`) coerces to `9`, not `20` (the year's first two digits). Verified
  against every real `argmax-time` response: none used an ISO timestamp — 0 rows flip.
- **Fail-fast on missing ground truth** (`src/questions.ts`) — score-neutral. `dst-offset` and
  `availability-day2` used to fall back to a default (`?? "+02:00"`, `day2Rained` defaulting to
  `true`) when the fixture was missing the relevant reading/day, silently producing wrong ground
  truth instead of failing loudly. Now throws, matching the existing `day1Obj` pattern. Verified
  dead-code on the committed primary fixture (`pnpm run generate` before/after this change
  produces a byte-identical `generated/tests.json` — confirmed via `git diff --stat`) and locked
  with a new ground-truth test asserting the guard's preconditions hold.
- **Root `pnpm-lock.yaml` churn** — `@swc/core` (+60 platform variants) had been concretely
  resolved as an optional peer of `ts-node` from when the eval package was briefly a root
  workspace member; reverted via a clean `pnpm install` at the repo root (the eval package stays
  excluded — see `pnpm-workspace.yaml`), dropping `@swc/core` references back to the same
  unresolved-optional-peer count as `main`.
- **PR description reconciliation** — the PR #100 body's "What's validated vs. not run yet"
  section was stale (written before the full paid sweep in "Full sweep results, complete" above
  ran); updated via `gh pr edit` to state the full sweep + judge slice ran and the verdict stands.

**Reconciling the one score-affecting fix, at $0**: the raw model responses for every completed
run are already committed/available in `generated/results*.json` (`response.output`), so instead
of a paid re-run, `src/summarize.ts` gained a `--rescore` mode (`pnpm run summarize -- --rescore
[path]`) that recomputes `success`/`score`/`outcome` for every row from its raw output using the
*current* scorer, then reuses all the existing gate/family/cost tables — no new OpenRouter calls.
Run across every committed results file:

- `generated/results.json` (full 13-provider sweep): **exactly 3 rows flip**, all `gpt-5.2`, all
  unparseable→correct — `val-0800` (primary, UTC variant) and `ms-argmax-sunshine` on both
  multiseries shapes (the OLD embedded 5-question multiseries track this file predates the
  expansion for — see "Multi-series eval, expanded" below, which is a separate run and unaffected).
  Every other row across all 429 graded rows in this file is bit-identical before/after. The
  figures above (gate table, all-tiers table, family table, per-model table, the old multiseries
  mention) have been updated to match; the **tiny-tier gate is untouched** (no `gpt-5.2` in that
  tier) and the **verdict is unchanged** — local time still strictly dominates UTC everywhere,
  `point-num` UTC moves from a flat 0% to 8% (1/13, still overwhelmingly one-sided).
- `generated/results-multiseries.json`, `results-compact.json`,
  `results-sevenday-full-baseline.json` (the dedicated 5-provider tracks used for "Multi-series
  eval, expanded" and "Compact long-series representation" below, neither of which includes
  `gpt-5.2`): **zero rows flip** — those sections' numbers stand exactly as reported.
- `generated/results-judge.json`: not applicable — the judge slice uses `llm-rubric` (Opus-graded),
  not this scorer; `--rescore` is a no-op on it by design (skips rows without `vars.expectedJson`).

## Multi-series eval, expanded (2026-07-09)

Max was happy with the local-vs-UTC verdict ("cheap, settles the local-time question") and asked
for two follow-ups ahead of a new GitHub issue (#101) covering the full multi-series expansion
(sunshine, wind, temperature — generalizing #98/#99's precipitation groundwork): make the
Shape A vs B comparison conclusive (the original 5-question mock only gave a mild signal), and
test whether a compact long-series representation rescues the tiny-tier drop seen on the 7-day
fixture in the full sweep above.

**Expanded `src/multiseries.ts` from 5 to 11 questions.** The original 5 (point-cross,
argmax-sunshine, argmax-wind, a 3-field compound check, sunshine cross-field) don't stress
*conditional* multi-series reasoning much. Added 6: `ms-argmax-precip` (single-param argmax, a
control), `ms-best-walk-hour` (conditional argmax: dry AND sunny AND calm, tie-broken by most
sunshine — new family `ms-compound-argmax`), `ms-windy-dry-hour` (existence + earliest-match:
dry AND wind>=14km/h — new family `ms-existence`, deliberately NOT the same hour as the
single-param wind argmax, to check the model isn't just pattern-matching "the windy hour"),
`ms-point-1900` (a second point-cross combination, all-different-from-the-original-hour's
true/false pattern to avoid the model learning a shortcut), and two more cross-field checks
(`ms-wind-avg-check`, `ms-precip-total-check`, mirroring the existing sunshine one). Every new
expected value is derived programmatically from `HOURLY_TABLE` via `.filter()`/`.reduce()` in
`multiseriesGroundTruth`, same "derived not hand-typed" discipline as the rest of this suite —
verified by hand against the raw table before running anything paid.

**Run: 5 representative providers** (not all 13, to control cost per Max's suggestion) — 1-2 per
tier: `opus-4.8` + `gemini-3.1-pro-preview` (frontier), `haiku-4.5` (cheap), `gpt-5-nano` +
`gemini-2.5-flash-lite` (tiny) — × 11 questions × 2 shapes = 110 calls, **0 API errors**.

```
shape                    n     score
multiseries-a (parallel) 55     76%  [correct:42]
multiseries-b (unified)  55     84%  [correct:46]
```

By family — Shape B's advantage concentrates exactly where cross-parameter combination is
required, and disappears (or slightly reverses) for single-parameter lookups:

```
family                       A      B
ms-compound-argmax          20%    60%   (conditional argmax: 1/5 -> 3/5 on B; n=5 per shape, small)
ms-cross-field               87%   100%   (does the daily total match the hourly sum)
ms-argmax (single-param)     93%    87%   (no shape benefit — nothing to cross-reference)
ms-point-cross                67%    73%
ms-existence                  80%    80%   (tied)
```

The overall 84% vs 76% margin is 46/55 vs 42/55 — a 4-question swing, not a landslide; treat "B
wins" as directional, not statistically overwhelming, and read the family table as *where the
mechanism shows up* (cross-parameter questions) rather than as independently conclusive per-cell.

Per-provider: `opus-4.8` 82%→100% (A→B), `gemini-2.5-flash-lite` 64%→91% (7/11→10/11), `haiku-4.5`
tied 73%, `gemini-3.1-pro-preview` 100%/100% (see below), `gpt-5-nano` 64%→55% (7/11→6/11, the one
exception — its shape-B misses are wrong-hour guesses of the same kind it makes on shape A, not
shape-specific). 4 of 5 providers score equal-or-better on Shape B, but **the two tiny-tier models
split**: `gemini-2.5-flash-lite` strongly prefers B (+3 questions), `gpt-5-nano` slightly prefers A
(-1 question). Net favors B, but this is worth stating plainly rather than folding into "4 of 5" —
the tiny tier is the one the project cares most about, and it isn't unanimous.

**`gemini-3.1-pro-preview`'s `max_tokens` fix confirmed working.** Gave this provider its own
config (`max_tokens: 1024` instead of the shared 256) in `promptfooconfig.yaml` — see that
file's comment — after tracing its depressed local-fixture score in the full sweep to a
token-budget truncation artifact, not a comprehension failure. Result: 100%/100% on both shapes
here, 22 calls, 0 truncations. Fix confirmed, not just theorized.

**Recommendation: build the multi-series expansion as Shape B** (`hourly[]` of `{time, precip_mm,
sunshine_minutes, wind_kmh}` objects), not Shape A (parallel per-parameter arrays) — on balance,
not as an unqualified landslide. It's the low-regret pick: net-better-or-tied for 4 of 5 providers,
no model dramatically worse, a mechanistically sensible story (Shape A's cost is index/timestamp
alignment across separate arrays, which is exactly where its disadvantage concentrates), and it's
the cleaner shape to extend to more series later. But the tiny tier split between the two shapes
rather than moving in lockstep, so call this "B, with consistent theory support," not "conclusively
B" — the n is real evidence, not proof beyond a reasonable doubt. Posted as a comment on #101
alongside the full breakdown.

## Compact long-series representation (2026-07-09)

The full sweep found tiny tier scoring ~50% on the 7-day (~168-entry) fixture, vs. 86-100% on
the shorter primary fixture — raising the question of whether the sheer length/sparsity of the
array (144 of 168 hourly entries are exactly 0 on this fixture) was the cause, and whether a
compact representation would help.

**Caution applied before concluding anything**: that ~50% figure came from just 2 questions
(`sevenday-wettest`, `sevenday-afternoon-shower`) — too thin to draw a "long series breaks tiny
models" conclusion from. Expanded `sevenDayQuestions()` from 2 to 5 (added `sevenday-thu-hour15`
a point-num lookup, `sevenday-mon-dry` a day-level bool, `sevenday-tue-total` a day total) so any
finding would be less confounded by one hard question dominating a tiny sample.

**Candidate compact representation** (`src/compact-representation.ts`): list only hours with
measurable rain (`value > 0`), with an explanatory note that unlisted hours were 0mm. On this
fixture that's a 168→24-entry reduction, ~67% smaller by byte size (19,205 -> 6,374 bytes for
the JSON blob). Same underlying instants/ground truth as the full representation — only the
hourly array's density changes, isolating that one variable the same way `fixture.ts` isolates
local-vs-UTC.

**Ran both representations against the same 5 questions, same tiny-tier providers, for a clean
apples-to-apples comparison** (not the confounded 2-question figure from the full sweep):

```
representation          tiny-tier score (n=20, 4 models: gpt-5-nano, gemini-2.5-flash-lite,
                                            ministral-8b-2512, llama-3.3-70b-instruct)
full (168 entries)             75%  (15/20)
compact (sparse, 24 entries)   80%  (16/20)
```

**Honest finding: marginal improvement, not a rescue.** Traced per-model: only
`ministral-8b-2512` actually improved (80%→100%); the other three tiny models scored
*identically* on both representations. The dominant recurring failure
(`sevenday-afternoon-shower`, a 4-hour range-sum) persists almost unchanged across both — 3 of 4
tiny models undershoot that sum by 0.1-0.3mm on full representation, and by a near-identical
margin on compact. Looking at the actual wrong answers: the common miss is 1.2mm against an
expected 1.3mm (0.2+0.6+0.4+0.1 over the 14:00-17:00 range) — dropping the 17:00 endpoint rather
than a general arithmetic error, so this may be partly inclusive/exclusive range-boundary handling
rather than pure summation accuracy. Either framing supports the same conclusion below (constant
across both representations, so it doesn't change the full-vs-compact comparison), but if #101
acts on "why tiny models miss this," the boundary-handling angle is worth checking too, not just
raw addition. **This means the tiny-tier weak point on long series is (at least partly) multi-hour
range/summation accuracy, not array length/sparsity** — compacting the array doesn't fix that, it
just gives the model less irrelevant data to scan past on the way to the numbers it still adds
up wrong. The original ~50% figure was mostly an artifact of a thin 2-question sample where that
one hard question happened to dominate, not a broad "tiny models can't cope with long series"
signal — with 5 questions, tiny tier holds up much better (75-80%) on this fixture than the
partial sample suggested.

**Recommendation for #101**: adopt the compact/sparse representation as a reasonable, low-risk
size optimization for long-horizon requests (smaller payload, no measured downside, small
positive signal), but don't expect it alone to solve range-sum accuracy for the smallest models —
that would need a different intervention (e.g. the tool computing and surfacing period totals
itself, rather than expecting the model to sum a long hourly series), out of scope for this PR.

**Cost for both follow-ups**: multi-series expansion + compact-representation comparison +
apples-to-apples full-representation rerun (to fix the confound above) together cost **~$0.51**
(account usage $1.4514 -> $1.9574, verified via OpenRouter's account API), comfortably within
the $1-2 target and the $10 ceiling.

## Current status

- **Verdict stands: keep local-time labeling on PR #99, do not switch to UTC.** Complete
  13-provider sweep + judge slice, 0 API errors, all 6 Copilot review comments addressed and
  reconciled at $0 (see "Copilot review fixes" above).
- Issue [#101](https://github.com/eins78/meteoswiss-llm-tools/issues/101) — "Implement all
  hourly time series in getLocalForecast" — tracks the sunshine/wind/temperature expansion this
  suite's secondary tracks fed into (Shape B recommendation, compact-representation
  recommendation). Its step 1 (evals before implementation) is done; step 2+ (confirming OGD
  param codes, schema/implementation) is not started, deliberately.
- PR #100 has not been merged (explicit constraint — do not merge). Acting on the verdict itself
  (e.g. touching PR #99's schema, or implementing #101) is out of scope for this PR, which is
  evals-only.
