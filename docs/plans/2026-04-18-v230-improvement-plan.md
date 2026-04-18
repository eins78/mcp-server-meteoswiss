# MeteoSwiss MCP v2.3.0 improvement plan

> Triage 10 recommendations from the external v2.3.0 QA report, grouped by root cause, into a 2.3.1 patch + 2.4.0 minor split. Review, not implementation.

## Status

- **Phase:** Draft
- **Type:** docs
- **Sprint:** —

## Changelog

<!-- Release note entry. Written during planning, refined during implementation. -->

- (no user-facing change — this plan is a review document; the chosen options will land under their own plans)

## Motivation

An external QA pass on `meteoswiss-mcp` v2.3.0 (2026-04-18, Functional GmbH) ran 34 test cases across all 7 tools: 25 pass, 7 warnings, 2 fails. The report produced 10 prioritised recommendations across 2× P1 (silent data gaps), 3× P2 (usability / consistency), 5× P3 (polish).

This plan does two things:

1. **Clusters the 10 recs by root cause, not just by priority** — because priority tells you what to ship first but not what to refactor together.
2. **Weighs four release-shaped options** for the cluster of fixes, and recommends one — a narrow 2.3.1 patch for the two P1s, followed by a 2.4.0 minor that groups P2+P3 into four cluster PRs.

It does not fix anything. The regression-test codification for the report's 34 cases ships in a separate companion PR (see Notes).

Ancestry: this is a standalone review plan. It is orthogonal to but overlaps with [PR #82 / geocoding-workarounds-review](https://github.com/eins78/meteoswiss-llm-tools/pull/82) on two recs (REC-05, REC-09) — flagged below.

**Canonical source:** external report artifact at <https://claude.ai/public/artifacts/fe91e313-04a2-4fd1-b2f1-b6aa3da9a4d0> (saved locally during this session at `/tmp/meteo-v230-external-test-report.md`).

## Design

### Findings inventory (10 recs, keyed to external report IDs)

#### P1 — breaking / silent failures (2)

- **REC-01** — `meteoswissClimateData`, cases **CD-05 + CD-06 FAIL**. Daily resolution with historical `start_date` silently returns `[]`. Concrete: `station="Zürich", resolution="daily", start_date="2024-12-01", end_date="2024-12-31"` → empty array, no error. Same on `station="Davos"`. Root cause: the daily endpoint has a ~14-day rolling window; dates outside it return no rows. The tool does not detect or surface this.
- **REC-02** — `meteoswissClimateData`, from **CD-03 note**. Daily data schema is temperature-only (no precipitation, sunshine, or indicators that monthly and yearly provide). Schema reduction is not documented — clients requesting daily data get a silently truncated shape relative to monthly / yearly requests on the same station.

#### P2 — usability / consistency (3)

- **REC-03** — `search`, case **SR-06 FAIL**. Page 2 for the same query as page 1 duplicates ~50% of page 1 results (5 of 10). Upstream MeteoSwiss search API behaviour; persists from v2.x. No server-side deduplication.
- **REC-04** — `meteoswissPollenData`, from **PO-\* notes**. No staleness indicator despite up to 12-day data lag observed (Buchs SG last reading 06.04.2026 in a 2026-04-18 query). `data_age_days` / `is_stale` field missing.
- **REC-05** — `meteoswissLocalForecast`, case **LF-04 FAIL**. `location="ZUE"` rejected with "No forecast location found for ZUE" despite ZUE being a valid SMN abbreviation surfaced by `meteoswissStations`. Tool-to-tool inconsistency — SMN vs NBCN vs forecast-points have different abbreviation sets, and the forecast tool's set does not include SMN-only codes.

#### P3 — polish (5)

- **REC-06** — `meteoswissStations`, case **ST-04 WARN**. `limit=200` cap, but `total=299` (since v2.3.0 precipitation-only stations were added). ~99 stations unreachable via this endpoint.
- **REC-07** — `fetch`, from **FE-02 WARN**. `format=text` duplicates the page title at the start of the content body.
- **REC-08** — `fetch`, cases **FE-02 + FE-03 WARN**. Blog articles and press releases still return lead paragraph only. Detail pages (FE-01) now return full body — this is the major v2.3.0 improvement — but page-type inconsistency is undocumented.
- **REC-09** — `meteoswissCurrentWeather`, case **CW-01 WARN**. `station="Zürich"` → KLO (airport, 13 km N of city centre) instead of SMA (canonical city station). Nearest-neighbour scoring treats KLO's coordinates as closer to some internal "Zürich" reference than SMA is, despite SMA being the municipality-match station.
- **REC-10** — `search`, case **SR-03 WARN**. `sort=date-desc` for publications returns 2024 bulletins first; 2025/2026 content not surfaced at top. Likely sorting by `lastModified` rather than `publicationDate` upstream.

### Root-cause clusters

The 10 recs don't split cleanly along priority lines. They split along four root causes, which is the more useful grouping for refactor boundaries.

| Cluster | Recs | Root cause | Future plot branch |
|---|---|---|---|
| **daily-NBCN data path** | REC-01, REC-02 | Daily-resolution endpoint has a rolling window the tool doesn't model; schema differs from monthly/yearly | `bug/climate-daily-window` |
| **search/fetch upstream normalisation** | REC-03, REC-07, REC-08, REC-10 | Upstream MeteoSwiss search/fetch quirks (dup pagination, title echoing, page-type extraction, sort-field mismatch) surface raw to tool clients | `bug/search-fetch-normalize` |
| **resolver identity / consistency** | REC-05, REC-09 | Tools disagree on what a station name / abbreviation means (ZUE valid in Stations but not Forecast; "Zürich" prefers proximity over municipality) | `feature/resolver-unification` |
| **metadata enrichment** | REC-04, REC-06 | Small additive fields / paging: pollen staleness flag, stations limit cap raise or page/offset | `feature/metadata-enrichment` |

Notable: the P1 cluster is a single cluster (`daily-NBCN data path`) and each P2/P3 cluster pulls from mixed priorities. That's why priority-only ordering wouldn't find good refactor seams.

### Overlap with PR #82 — flag for Max, do not decide here

[PR #82 (`idea/geocoding-workarounds-review`)](https://github.com/eins78/meteoswiss-llm-tools/pull/82) reviews 6 geocoding workarounds that landed across rc.3 → rc.4 on 2026-04-18: international-city blocklist, `geocodedNameMatchesQuery` guard, query classifier, postal-prefix fallback, swisstopo origin restriction, fetch URL-param revert.

Two recs in this plan are **adjacent but distinct**:

- **REC-05 (ZUE rejected by forecast)** — a per-tool abbreviation-set mismatch between `meteoswissStations` (accepts ZUE) and `meteoswissLocalForecast` (rejects ZUE). Not a swisstopo issue. PR #82 does not touch per-tool abbreviation handling.
- **REC-09 (Zürich → KLO instead of SMA)** — a nearest-neighbour scoring preference (municipality-match vs pure proximity). PR #82's Group A (swisstopo overmatch defences) could, under Option B of that plan, fold into a shared pipeline that makes REC-09 a one-line addition — but only if PR #82's Option B (shared pipeline) is chosen.

**Decision deferred to Max:** if PR #82 resolves in favour of a shared resolver pipeline (its Option B), fold REC-05 and REC-09 into that execution. Otherwise track them here under `feature/resolver-unification`.

### Options

**Option A — Fix all 10 individually.** 10 mini-PRs over 2-3 weeks, each targeting one rec.

- *Steelman.* Lowest individual PR risk; every shipping increment is visible to users; straightforward review because scope is one-rec-one-PR. CI cost is small for each.
- *Critique.* Repeats the exact cascade pattern that PR #82 is questioning: each mini-PR sees its rec in isolation, not the cluster. The `search/fetch` cluster especially benefits from one pass touching both; splitting them means the second PR rediscovers the same helpers. No release batching — every rec is its own release conversation.

**Option B — Patch + minor split (recommended for P1).**

- *2.3.1 patch:* REC-01 + REC-02 only. Scope: detect `[]` + out-of-window dates in the daily path, surface a descriptive error; document the daily-vs-monthly schema difference. Two tests flip green; one schema comment block.
- *2.4.0 minor:* REC-03..REC-10, grouped by cluster (see table above). Combine with Option C for the cluster execution.
- *Steelman.* Gets the two user-visible silent failures to production quickly without waiting on the cluster refactors. Honours the release train rhythm. Small, auditable patch release.
- *Critique.* Two release cuts instead of one. Non-P1 work waits for the minor — P2 users live with search pagination dups until 2.4.0 ships.

**Option C — Cluster-driven refactor for 2.4.0 (recommended for P2+P3).**

- Each of the four clusters becomes one plot plan → one PR. Four PRs instead of eight, with each PR's shared context (e.g., single `search`/`fetch` normalisation module) amortised across its cluster's recs.
- *Steelman.* Naturally dedups the "add yet another defensive guard" sprawl PR #82 flags. Refactor seams fall where the clusters do, not where the priority labels do. Lower long-term maintenance because each cluster gets a single owner and a single design pass.
- *Critique.* Higher upfront cost per cluster. Each cluster PR is reviewable but not one-line-per-rec. Harder to revert a single rec's change without reverting the cluster.

**Option D — Punt P3s, ship 2.3.1 + 2.4.0 with P1+P2 only.**

- *2.3.1:* REC-01 + REC-02.
- *2.4.0:* REC-03 + REC-04 + REC-05. P3s → backlog.
- *Steelman.* P3s are all "works but surprising", not "works wrong". If prioritisation bandwidth is the binding constraint, punt.
- *Critique.* P3s are where trust erodes. REC-06 (stations unreachable above 200) and REC-09 (Zürich wrong station) are visible every time a user asks the obvious thing. Punting makes 2.5.0 longer, not shorter.

### Recommendation

**Option B + Option C.**

- Cut **2.3.1** for REC-01 + REC-02 only. Scope-locked patch; the tests for both land in the companion regression PR as `it.skip` with `KNOWN-FAIL:` prefix — unskip them as part of the fix PR.
- Plan **2.4.0** as four cluster PRs, each with its own plot plan:
  - `bug/search-fetch-normalize` (REC-03, REC-07, REC-08, REC-10)
  - `feature/resolver-unification` (REC-05, REC-09) — coordinate with PR #82 outcome
  - `feature/metadata-enrichment` (REC-04, REC-06)
  - No fourth — the `daily-NBCN` cluster is in 2.3.1, not 2.4.0.

Defer the Max decision on folding REC-05 + REC-09 into PR #82's execution to whoever approves `feature/resolver-unification`.

### What this plan does NOT cover

- No implementation — all 10 recs remain untouched.
- No 2.3.1 release cut — that's a follow-up plan (likely `infra/release-2.3.1`).
- Regression-test codification ships in a companion PR (separate branch, non-draft).
- Changes to tool behaviour, schemas, or fixtures: none.

### Open Questions

- [ ] Should REC-05 + REC-09 fold into PR #82's execution, or stand alone under `feature/resolver-unification`? (Decide when PR #82 chooses its Option.)
- [ ] REC-02 — is the daily schema reduction a documentation fix only, or should the tool backfill fields from the NBCN daily aggregate to match monthly/yearly shape?
- [ ] REC-03 — is upstream dedup expensive enough that it should be opt-in via a flag?

## Branches

Future implementation branches (not created by this plan):

- `bug/climate-daily-window` — REC-01, ships 2.3.1
- `bug/climate-daily-schema-docs` — REC-02, ships 2.3.1 (may merge with above as one PR)
- `bug/search-fetch-normalize` — REC-03, REC-07, REC-08, REC-10, ships 2.4.0
- `feature/resolver-unification` — REC-05, REC-09, ships 2.4.0 (coordinate with PR #82)
- `feature/metadata-enrichment` — REC-04, REC-06, ships 2.4.0

## Notes

- **External QA report (canonical):** <https://claude.ai/public/artifacts/fe91e313-04a2-4fd1-b2f1-b6aa3da9a4d0>
- **Local copy used during this session:** `/tmp/meteo-v230-external-test-report.md`
- **Companion PR:** codifies every test case from the external report (34 explicit + ~5 derived from "Notes") as Jest integration tests. `KNOWN-FAIL:` / `KNOWN-WARN:` marker on the 11 known-failing cases. Fixture-dependent cases are `it.skip` with reason. PR link to be added here once opened.
- **Related:** [PR #82 — `idea/geocoding-workarounds-review`](https://github.com/eins78/meteoswiss-llm-tools/pull/82). Overlap on REC-05 and REC-09 flagged above.
