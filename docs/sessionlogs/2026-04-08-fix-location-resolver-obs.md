# Fix Location Resolver + OBS Visual Observations

**Date:** 2026-04-08
**Source:** Claude Code

## Summary

Fixed two RC v2.3.0-rc.1 blockers: the location resolver silently returning wrong data for ambiguous/invalid inputs across 3 tools, and OBS visual observation boolean fields being stripped from JSON output.

## Key Accomplishments

- Fixed "Bern" resolving to Passo del Bernina instead of Bern/Zollikofen (word-boundary-aware scoring)
- Added Swiss bounding box check on geocoded results to reject non-Swiss queries ("Paris", "NOTASTATION")
- Added distance thresholds on geocoding fallback (50km SMN, 80km NBCN, 30km forecast)
- Added empty/whitespace input validation across all 3 resolvers
- Fixed OBS boolean fields: `-` (not observed) now returns `false` instead of being stripped as `undefined`
- Created PR eins78/meteoswiss-llm-tools#66 — CI green after re-run (initial flaky timeout)

## Changes Made

- Created: `packages/meteoswiss-mcp/src/support/name-matcher.ts`
- Created: `packages/meteoswiss-mcp/test/unit/name-matcher.test.ts`
- Modified: `packages/meteoswiss-mcp/src/support/geocode.ts`
- Modified: `packages/meteoswiss-mcp/src/data/ogd-smn-stations.ts`
- Modified: `packages/meteoswiss-mcp/src/data/ogd-nbcn-stations.ts`
- Modified: `packages/meteoswiss-mcp/src/data/ogd-station-resolver.ts`
- Modified: `packages/meteoswiss-mcp/src/data/ogd-current-weather.ts`
- Modified: `packages/meteoswiss-mcp/test/integration/ogd-current-weather.test.ts`
- Modified: `packages/meteoswiss-mcp/test/integration/ogd-local-forecast.test.ts`
- Modified: `test/__fixtures__/ogd/measurements/VQHA80.csv` (added BER)
- Modified: `test/__fixtures__/ogd/metadata/ogd-local-forecasting_meta_point.csv` (added BER)
- Created: `docs/research/2026-04-08-rc2-test-report.md`

## Decisions

- **Scored matching over edit-distance**: Used a 3-tier scoring system (exact=100, word-boundary=50, substring=10) instead of Levenshtein/edit-distance. Simpler, deterministic, and directly addresses the "Bern"/"Bernina" disambiguation without requiring a threshold tuning.
- **`-` means `false` for OBS booleans**: MeteoSwiss uses `-` for "phenomenon not observed" in OBS CSVs. The CSV parser globally maps `-` to `null`. The `parseFlag` function (local to `fetchVisualObservations`) now treats `null` as `false` rather than `undefined`. This is semantically correct: "not observed" = the phenomenon didn't occur. SIO station still returns no data — that's an upstream data availability issue, not a code bug.
- **Distance thresholds are generous**: 50km (SMN, ~300 stations), 80km (NBCN, ~75 stations), 30km (forecast, ~6000 points). These catch non-Swiss queries (hundreds of km from any station) without rejecting legitimate Swiss locations.
- **Swiss bounding box in geocoder, not resolvers**: Placing the check in `geocodeSwissLocation()` means all current and future callers get the guard automatically. One check instead of three.

## Not Fixed (by design)

- **SIO visual observations**: Likely empty/missing CSV on MeteoSwiss servers. Code handles gracefully via try/catch.
- **Postal codes 1200/3000**: MeteoSwiss metadata may not include parent postal codes. Fix requires live geocoding which can't be tested with fixtures. The bounding box + distance threshold will improve production behavior.
- **"Zurich" → KLO (airport)**: Both "Zürich / Kloten" and "Zürich / Fluntern" score equally (word boundary). Would require population data or manual preference list.

## Post-Merge: CI Fix + Release

After PR #66 merged, CI had flaky "Server failed to start in time" failures — each integration test was spawning its own MCP server in `beforeEach` (~64 process startups). Fixed by switching all 8 MCPClient test files to `beforeAll`/`afterAll` (one server per file, ~8 startups). Test runtime dropped from ~11s to ~3.4s locally.

Released as `meteoswiss-mcp-v2.3.0-rc.2` (pre-release) following the same manual RC pattern as rc.1: changeset → `pnpm run version` → override to rc.2 → tag → GitHub release.

## Next Steps

- [ ] Re-run E2E tests against TEST deployment with rc.2
- [ ] Promote to stable v2.3.0 if E2E passes
- [ ] Consider adding postal code prefix matching for parent codes (1200→1201)

## Repository State

- Branch: `main` (PR #66 merged)
- Tag: `meteoswiss-mcp-v2.3.0-rc.2`
- Release: https://github.com/eins78/meteoswiss-llm-tools/releases/tag/meteoswiss-mcp-v2.3.0-rc.2
- Plan: `~/.claude/plans/clever-exploring-brook.md`
