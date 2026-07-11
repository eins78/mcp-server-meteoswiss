# Hourly multi-series shape refinement — results (2026-07-11)

This file is **immutable** — it records what one specific set of runs found on this date. See
[`../../README.md`](../../README.md) for the current headline verdict and quick-start, and
`../../src/multiseries.ts`'s header for the design/methodology these runs exercised.

## Context

Issue #101 (all hourly time series in `getLocalForecast`: sunshine, wind, temperature, plus
folding in station-point hourly precipitation) builds on Round 1's Shape A vs Shape B verdict
(see `2026-07-09-forecast-json-comprehension.md` — Shape B, unified per-hour objects, won 84%
vs 76%). Before implementing, Max asked two further shape questions to be gated on evidence
rather than decided by fiat:

- **Q1 (wind fields)**: ship wind speed only (`wind_kmh`), or speed + gust (`wind_kmh` +
  `wind_gust_kmh`, from OGD `fu3010h0`/`fu3010h1`)? Extra per-hour fields are the exact
  token-cost risk Round 1 flagged for small models.
- **Q3 (daily container)**: keep the Round-1-measured "mixed" shape (temperature nested
  `{min,max,unit}`, everything else flat), or flatten temperature too
  (`temperature_min_c`/`temperature_max_c`) per Max's "all-flat" ask?

Run as **one 2×2 factorial** (not two single-axis runs) specifically so the interaction between
the axes could be measured rather than assumed independent.

## Method

- 4 fixture variants (`b-mixed-nogust`, `b-mixed-gust`, `b-flat-nogust`, `b-flat-gust`), all
  rendered from one canonical 24-hour table (ground truth identical by construction — see
  `hourlyRows()`/`multiseriesGroundTruth` in `src/multiseries.ts`). Adds hourly temperature
  (`temperature_c`), absent from Round 1, to every variant.
- 14 questions per variant (the 11 from Round 1 unchanged, + `ms-argmax-temp`,
  `ms-temp-max-check`, and a gust question conditioned on the variant — an answerable argmax
  when gust is present, a decline-or-hallucinate check reusing the `unavailable` scorer kind
  when it's absent) = 56 test cases, + 1 station-mock question (6 more test cases across the
  tier slice) = 342 total graded rows.
- Station mock (`stationMockFixture`/`stationMockQuestion`): exercises Max's Q2 ruling
  separately — a station's official daily precipitation total (2.3mm) deliberately does NOT
  equal the sum of its shown hourly series (1.6mm), and the model must recognize that mismatch
  as *expected*, not report `matches_hourly_sum: true` by pattern-matching the postal-code
  behavior.
- Model slice: 2 tiny (`gpt-5-nano`, `ministral-8b`), 2 cheap (`haiku-4.5`,
  `gemini-3.1-flash-lite`), 2 frontier (`opus-4.8`, `gemini-3.1-pro-preview`) — mirrors Round
  1's "1-2 per tier" sampling.
- Scorer fix made alongside: `scoring-core.ts`'s `unavailable` fabrication check generalized
  from a hardcoded `"mm"` key to any other numeric key in the response, so the new
  `gust_kmh`-schema decline question gets the same hallucination check without a scorer change
  per question (2 new unit tests added in `scoring.test.ts`).

## Results

### Main effects (all tiers, 336 factorial rows)

| axis | value | n | mean score | pass |
|---|---|---|---|---|
| gust | absent | 168 | 87.8% | 142/168 |
| gust | present | 168 | 88.9% | 143/168 |
| container | mixed (temp nested) | 168 | 88.4% | 142/168 |
| container | all-flat | 168 | 88.3% | 143/168 |

### 2×2 cell means

| gust \ container | mixed | all-flat |
|---|---|---|
| absent | 88.7% (n=84) | 86.9% (n=84) |
| present | 88.1% (n=84) | 89.7% (n=84) |

**Interaction term**: (gust effect @ flat) − (gust effect @ mixed) = +2.8% − (−0.6%) = **+3.4 points**
— small, within run-to-run noise at this sample size. The two axes are effectively
**independent**, confirming the factorial's hypothesis rather than overturning it.

### Distraction-cost check (Q1) — non-gust questions only, 13 of 14, n=156/arm

| gust variant | mean score |
|---|---|
| absent | 86.9% |
| present | 88.0% |

Adding the gust field does **not** degrade the other 13 questions — if anything marginally
higher (noise-level difference). By tier: tiny 78.9%→79.5%, cheap 88.1%→88.1% (flat), frontier
96.4%→99.1%. No tier shows degradation.

### Gust question itself — hallucination + comprehension check

| variant | question | n | pass |
|---|---|---|---|
| gust absent | decline-or-hallucinate (`ms-gust-unavailable`) | 12 | **12/12** |
| gust present | argmax (`ms-argmax-gust`) | 12 | **12/12** |

Every tier, every model: 100% both directions. No hallucination when gust is absent; correct
identification of the peak-gust hour when present.

### New hourly-temperature questions

`ms-argmax-temp` and `ms-temp-max-check`: **24/24 (100%)** each, across all variants/tiers —
adding `temperature_c` to the hourly object costs nothing measurable.

### Cross-field invariants (postal-code total == sum(hourly)), all variants combined

| question | n | pass rate |
|---|---|---|
| `ms-sunshine-total` | 24 | 95.8% (23/24) |
| `ms-wind-avg-check` | 24 | 83.3% (20/24) |
| `ms-precip-total-check` | 24 | 95.8% (23/24) |

Comparable magnitude to Round 1's ~84-100% per-family range; not a new regression from either
axis (the same questions existed, unchanged, in Round 1). `ms-wind-avg-check`'s slightly lower
rate is consistent with averaging (vs. summing) being a marginally harder mental operation for
small models — not shape-related.

### Station mock — relaxed invariant recognition (Q2 sanity check, not itself gated)

**5/6 exact-pass** (83%), **91.7% mean score** (partial credit). Every cheap and frontier model
(4/4) got both the total AND the mismatch flag exactly right. The one miss: `tiny/gpt-5-nano`
returned the correct total (`2.3`) but incorrectly claimed `matches_hourly_sum: true` — it read
the number correctly but defaulted to assuming consistency rather than checking. This confirms
Max's Q2 ruling (station keeps its official aggregate, `hourly[]` alongside) is a real,
recognizable pattern for capable models; the single tiniest-tier miss is a prompt-clarity note
for the shipped tool description, not a reason to revisit the ruling.

## Decisions (applying the pre-registered rules)

- **Q1 (gust): SHIP.** No degradation on non-gust questions (any tier), and models handle the
  conditional gust question perfectly in both directions. `wind_kmh` + `wind_gust_kmh` ship in
  the hourly object; `wind_avg_kmh` + `wind_gust_max_kmh` in the daily summary.
- **Q3 (all-flat): SHIP.** Main effect is a statistical tie (88.4% mixed vs 88.3% flat, well
  within noise) — the pre-registered rule says tie breaks to all-flat per Max's explicit ask.
  `temperature_min_c`/`temperature_max_c` ship as top-level scalars, matching every other
  measurement key's unit-suffix convention.
- **Interaction**: confirmed small/negligible — no compounding cost from shipping both
  decisions together.

## Cost

- Estimated (token-based, `summarize.ts`'s `MODEL_PRICING` table): **$1.6472** for this run
  (342 rows, 6 providers).
- OpenRouter account lifetime `total_usage` at time of check: $3.63 (no pre-run snapshot was
  taken to isolate this run's marginal delta via the account API; the token-based estimate is
  the number to trust here, consistent with the account total given Round 1's $0.51 plus prior
  smoke/dryrun exploration).
- Within Max's pre-approved ~$1-2 budget for this round.
