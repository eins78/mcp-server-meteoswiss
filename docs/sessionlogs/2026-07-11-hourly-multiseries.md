# All Hourly Time Series in getLocalForecast

**Date:** 2026-07-11
**Model:** Claude Opus 5 / Claude Sonnet 5 (worktree `hourly-timeseries`, branch `worktree-hourly-timeseries`)
**Ticket:** [#101](https://github.com/eins78/meteoswiss-llm-tools/issues/101)

## Motivation

#98/#99 added an hourly precipitation breakdown to `meteoswissLocalForecast`, but left it
precipitation-only and skipped weather stations entirely (`hourly: null` unconditionally). #101
generalizes that groundwork: expose hourly temperature, sunshine, and wind alongside
precipitation, in one unified per-hour object (Shape B, per Round 1's eval —
`2026-07-09-forecast-json-comprehension.md`), and fold hourly data into station points too.

Three shape questions were open going in, and Max ruled on each explicitly rather than leaving
them to implementation judgment — two of the three gated on evidence, not fiat.

## Decisions and rationale

### Q1 — wind fields: speed + gust, gated on an eval

Round 1 flagged extra per-hour fields as a token-cost/small-model-degradation risk. Max's
ruling: include gust (`wind_kmh` + `wind_gust_kmh`, from OGD `fu3010h0`/`fu3010h1`), but only if
an eval round showed it didn't measurably hurt comprehension. Direction (`dkl010h0`) stays out —
not asked for, no ruling needed.

### Q2 — station daily totals: keep official aggregates, do not unify

Weather stations already publish their own curated daily aggregates (`tre200dx`/`tre200dn`,
`rka150d0`). Max's ruling: keep those as the daily summary and add `hourly[]` alongside, rather
than deriving the summary from the hourly series like postal/mountain points do. Explicit,
accepted consequence: for stations, `precipitation_total_mm` may **not** equal
`sum(hourly[].precip_mm)` — a relaxed invariant, not a bug. Postal-code/mountain points still
derive every summary field from the shown hourly series, so the invariant holds there
unconditionally.

### Q3 — daily container shape: all flat, gated on an eval

Round 1 measured a "mixed" shape (temperature nested `{min,max,unit}`, everything else flat) as
part of the Shape A/B comparison — that was never itself a tested variable. Max wants
everything flat, including temperature, matching every other field's `_unit` suffix convention
(`temperature_min_c`/`temperature_max_c`, not nested). Gated on an eval showing all-flat scores
at least as well as the measured mixed shape (tie breaks to all-flat, per Max).

### Naming — unit suffix on every measurement key, no exceptions

Once Q3 flattened temperature, Max extended the rule to every key project-wide: every
measurement field carries its unit suffix consistently, so `temperature_min`/`temperature_max`
became `temperature_min_c`/`temperature_max_c` to match the existing `_mm`/`_minutes`/`_kmh`
pattern. Applied to both the daily summary and the hourly object.

### Eval strategy — one combined 2×2 factorial, not two single-axis runs

Q1 and Q3 are plausibly independent (per-hour field density vs. day-level container structure),
but running them as one factorial rather than two separate runs let the **interaction** be
measured directly instead of assumed. A factorial also shares fixtures/questions/model-slice
across both questions, keeping cost down.

## Eval results (full detail: `packages/meteoswiss-forecast-evals/docs/results/2026-07-11-hourly-multiseries-shape-refinement.md`)

4 fixture variants × 14 questions × 6 models (2 tiny, 2 cheap, 2 frontier) = 342 graded rows,
plus a dedicated station-mock question exercising the Q2 relaxed invariant.

- **Q1 gust: SHIP.** No degradation on the other 13 questions at any tier (tiny 78.9%→79.5%,
  cheap 88.1%→88.1%, frontier 96.4%→99.1% — gust present vs. absent). The gust question itself:
  **100% both directions** — no hallucination when absent (12/12 decline correctly), correct
  peak-gust-hour identification when present (12/12).
- **Q3 all-flat: SHIP.** Main effect was a statistical tie (88.4% mixed vs. 88.3% flat) — the
  pre-registered tie-break rule (all-flat wins ties) applied. New hourly-temperature questions
  scored 100/100 (24/24) across every variant and tier, confirming adding `temperature_c` to the
  hourly object costs nothing measurable.
- **Interaction term: +3.4 points** — small, within run-to-run noise at this sample size. The
  two axes are effectively independent, confirming the factorial's premise rather than
  overturning it.
- **Q2 station-mock sanity check** (not itself gated, but validated): 5/6 exact-pass (83%),
  91.7% mean score with partial credit. Every cheap and frontier model correctly reported both
  the official total and the "doesn't match hourly sum" flag; the single miss was
  `tiny/gpt-5-nano` reading the correct total but wrongly assuming consistency — a prompt-clarity
  note for the shipped tool description, not a reason to revisit the ruling.
- **Cost: $1.6472** (token-based estimate, 342 rows across 6 providers) — within Max's
  pre-approved ~$1–2 budget.

## Implementation

- **Schema** (`src/schemas/ogd-local-forecast.ts`): replaced `HourlyPrecip` with `HourlyEntry`
  (`time` + five independently-nullable per-series fields); rewrote `DailyForecast` to the flat,
  unit-suffixed shape.
- **Data layer** (`src/data/ogd-local-forecast.ts`): `HOURLY_PARAMS` extended to
  `tre200h0, rre150h0, jww003i0, sre000h0, fu3010h0, fu3010h1`; new
  `groupUnifiedHourlyByDate()` unions timestamps across all five series into one `HourlyEntry`
  per hour (skips an hour only if every field is null), bucketed to local Europe/Zurich day for
  **both** point types uniformly; new `summarizeHourlyEntries()` derives min/max/sum/avg
  summary fields from an `HourlyEntry[]`. Stations now fetch both `DAILY_PARAMS` and
  `HOURLY_PARAMS`; `buildStationForecast()` keeps the official temp/precip aggregates unchanged
  and adds sunshine/wind (no official daily product for those) plus `hourly[]` derived from the
  same series.
- **Fixtures**: new `sre000h0.csv`, `fu3010h0.csv`, `fu3010h1.csv` for the postal-code point;
  station hourly rows appended to all five hourly CSVs, with precipitation deliberately summing
  to a different total than the official daily aggregate (9.5mm vs. 11.3mm) to exercise the
  relaxed Q2 invariant in tests, plus one `-` no-data marker to exercise per-field-null handling.
- **Tests** (`test/integration/ogd-local-forecast.test.ts`): rewritten for the flat shape;
  exact-value hourly entry checks; cross-field derivation checks for postal/mountain points; a
  dedicated sparse-data test asserting a per-field `null` doesn't drop the whole hour and is
  correctly excluded from sums; a dedicated station fold-in test asserting the official
  aggregate is unchanged and `precipitation_total_mm !== sum(hourly precip)` — the relaxed
  invariant, made explicit rather than incidental.
- **Docs**: `server.ts` tool description rewritten for the unified `hourly[]` shape and the
  station official-vs-derived caveat; `views/homepage/tools.md`; root `CLAUDE.md`'s Open Tasks
  (temp/sunshine/wind marked done, cloud cover still open).
- **Skills parity** (`packages/meteoswiss-skills`): `REFERENCE.md`'s hourly parameter table
  gained `sre000h0`/`fu3010h0`/`fu3010h1`; `SKILL.md`'s forecast prose now notes every point
  type has hourly params and recommends official daily params for station temp/precip;
  `forecast.sh` fetches the full hourly set for both point-type branches, smoke-tested against
  live STAC data.
- **Changeset**: revised the pending `hourly-precip-forecast.md` (never released) in place to
  describe the shipped shape rather than the never-published precip-only field; added a matching
  `meteoswiss-skills` patch changeset for the parity update.

## Verification

`pnpm --filter meteoswiss-mcp run ci` (tsc + eslint + build + jest) — 22 suites, 204 passed, 1
pre-existing skip (documented macOS port-mapping flake, unrelated).
`pnpm --filter meteoswiss-forecast-evals` — 39/39 unit tests, lint clean.
`npx changeset status` — confirms `meteoswiss-mcp` minor, `meteoswiss-skills` patch.

## Result

Commits on branch `worktree-hourly-timeseries`, pushed to origin:

- `e3a92b2` — build Round-2 Shape B eval (gust × all-flat)
- `f0e0fb7` — run Round-2 factorial, lock gust+all-flat, unit-suffix temp
- `2f0035c` — expose all hourly time series in getLocalForecast
- `12703d1` — document all-hourly-series shape (MCP + skills parity)
- `160b0c3` — revise pending changeset for the full multi-series shape

PR #122 opened against `main`, sessionlog included in the PR branch per standing policy (no
post-merge docs PR).

## Copilot review fixes

Three automated review rounds on PR #122, each addressed before requesting the next:

1. **Round 1** (4 comments): a scorer failure message hardcoded `mm=` instead of the actual
   fabricated key name (generalized); `SKILL.md` said hourly aggregation groups by UTC day when
   the MCP server actually buckets by local Zurich day (documented the discrepancy); a test
   summed hourly precip with `?? 0`, silently treating a missing reading as zero and masking a
   potential null-handling regression (switched to filtering nulls first); the changeset was
   marked `minor` but the flat shape breaks the already-released v2.3.2 nested
   `temperature`/`precipitation` fields — a real breaking change, rebumped to `major` with the
   renames called out explicitly.
2. **Round 2** (2 new comments, 3 stale duplicates verified already-fixed): `jww003i0` was
   listed alongside the true hourly params implying one value per hour, but it's 3-hourly and
   used only for daily icon selection (split out with its own cadence note); `multiseries.ts`'s
   header said the mock "does NOT reflect anything meteoswiss-mcp emits today," true when
   written but stale now that this PR ships that exact shape (reworded).
3. **Round 3** (3 new comments, 2 stale duplicates): a real logic gap — `buildHourlyAggregatedForecast`
   derived its date list solely from `hourlyByDate.keys()`, so a day where all 5 hourly series
   were a total gap (but the icon param still had data — i.e. a day the forecast run genuinely
   covers) was silently dropped from `forecast[]` entirely instead of appearing with
   `hourly: []`, contradicting the documented null-vs-`[]` contract. Fixed by unioning the date
   set with dates present in the icon param (mirroring the pattern `buildStationForecast`
   already used with its own independent daily-param date source), plus a new fixture/test
   (`jww003i0.csv` gets a 2026-03-30 row with no corresponding data in the 5 hourly series)
   proving the day now surfaces with `hourly: []` and null summaries rather than vanishing. Also
   fixed a doc-comment path that used an unreadable `...` ellipsis instead of the full
   repo-relative path. The fourth comment (latency/upstream-fetch cost from 3→6 params for
   non-stations, 4→10 for stations) was answered inline rather than code-changed: the existing
   1-hour disk cache (`CACHE_TTL.forecast`, keyed per STAC item) already bounds the extra fetches
   to once per cache window, not per request, and always-on hourly across every point type is
   the explicit ask for #101, not an opt-in — a caller-controlled `includeHourly` flag is logged
   as a possible future follow-up, not built here.

4. **Round 4** (2 new comments, 4 stale duplicates/own-reply): a sharper version of round 3's
   date-derivation fix — the non-station path could never produce `hourly: null` even when
   *none* of the 5 hourly series had any data for the location at all (as opposed to a single
   day's gap), collapsing the documented null-vs-`[]` distinction that `buildStationForecast`
   already respects. Added the same `hourlyTrulyUnavailable = hourlyByDate.size === 0` guard to
   the non-station path, mirroring the station pattern exactly. Also fixed a second instance of
   the `...`-ellipsis doc-path issue from round 3, in a different function's comment. Not
   integration-tested end-to-end: reaching this branch for a real, resolvable postal/mountain
   point requires a location whose forecast run publishes the 3-hourly icon series but *none*
   of the 5 hourly measurement series across every timestamp — reproducing that would need a
   new synthetic resolvable-location fixture (location-resolver entry + point metadata),
   disproportionate scope for what is a defensive-correctness fix mirroring an already-shipped
   (if likewise untested end-to-end) pattern on the station side. Logged as a coverage gap
   rather than claimed as covered.

5. **Round 5** (4 stale duplicates/own-reply, 2 new): a genuine inefficiency — stations fetched
   `jww003i0` (weather pictogram) via `paramsToFetch`, but never used it (`buildStationForecast`
   sources its icon from the official `jp2000d0` daily param instead, and
   `groupUnifiedHourlyByDate` doesn't process `jww003i0`), so every station request downloaded
   an unused CSV. Excluded `jww003i0` from the station branch's fetch list. Mirrored the same
   fix in `forecast.sh` for skills↔MCP parity (also moved `jww003i0` out of the shared
   `HOURLY_PARAMS` var and appended it only to the non-station `PARAMS` string), and fixed the
   script's comment, which had the same "every point type has the hourly params" cadence
   overstatement round 2 fixed in `SKILL.md`. Verified both branches live against a populated
   STAC item (`20260711-ch` — the current newest item, `20260712-ch`, had the same
   zero-assets-yet publishing quirk noted earlier in this log): station fetch no longer includes
   `jww003i0` (0 matches), postal fetch still does (217 matches, 3-hourly across the response
   window).

6. **Round 6** (2 stale duplicates, 1 new): a pre-existing factual error in the "Common
   point_ids" documentation examples (`SKILL.md`, `forecast.sh`), touched but not introduced by
   this PR — `Zurich=48, Bern=29, Geneva=53` was wrong; verified against live STAC point
   metadata that point 48 is actually Napf (the mountain station this PR's own station test
   fixtures use, e.g. the "Napf" test at `ogd-local-forecast.test.ts:224`), 29 is Samedan, and 53
   is Interlaken — none of them anywhere near the three named cities. Looked up the correct
   station point_ids for the named cities (Zurich/SMA=71, Bern/BER=78, Geneva/GVE=58) and fixed
   all 4 occurrences across both files (`SKILL.md` lines 74/80/111, `forecast.sh`'s header
   comment and usage/example text). Verified live: point 71 resolves to Zurich/Fluntern station
   data (plausible July temperatures).

Round 6's other 2 comments were stale duplicates from earlier rounds. Per Max's convergence
guard (Copilot always returns COMMENTED, never APPROVED, so waiting for approval would loop
forever): a round with a real, actionable finding still gets one more fix-and-re-request cycle;
only a round with nothing new/actionable stops the loop and proceeds to merge.

Full CI re-verified green after each round (final: 22 suites, 206 tests, 1 pre-existing
unrelated skip).

## Pending / follow-ups

- Wind direction (`dkl010h0`) intentionally out of scope — not requested.
- Cloud cover remains an open item in `CLAUDE.md`'s Open Tasks, unrelated to this ticket.
- Neither `buildHourlyAggregatedForecast`'s nor `buildStationForecast`'s `hourlyTrulyUnavailable`
  (`hourly: null` for a total location-level data gap) branch has direct integration-test
  coverage — both are exercised by inspection/CI-passing only, not a dedicated fixture. Worth
  adding if a real-world report of the null-vs-`[]` distinction ever surfaces.
- Possible future follow-up (not requested, not built): a caller-controlled option to omit
  `hourly` for latency-sensitive callers, if MeteoSwiss's publish cadence or real-world latency
  ever makes the extra per-request param count (bounded today by the 1-hour disk cache) worth
  revisiting.
