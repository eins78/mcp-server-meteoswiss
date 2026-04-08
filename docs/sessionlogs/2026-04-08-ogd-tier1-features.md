# OGD Tier 1 Features Implementation

**Date:** 2026-04-08
**Source:** Claude Code
**Session:** Reconstructed from 4 compaction(s) · ~1k input / ~94k output tokens

## Summary

Implemented 3 MeteoSwiss OGD Tier 1 features across 4 PRs (1 prerequisite + 3 features), then created RC v2.3.0-rc.1 release. All PRs merged to main, release triggered npm publish and Docker build.

## Plan Reference
- Plan: `~/.claude/plans/humble-whistling-planet.md`
- Planned: 4 PRs (CSV parser, SMN-precip, NBCN climate, visual observations) + RC release
- Executed: All 4 PRs merged + RC release created. Fully executed as planned.

## Key Accomplishments

- **PR #61** `refactor/csv-parser`: Replaced custom RFC 4180 CSV parser with `csv-parse/sync` library
- **PR #62** `feat/smn-precip`: Merged ~248 precipitation-only stations into `meteoswissCurrentWeather` (station count ~160 → ~300)
- **PR #64** `feat/climate-data`: New `meteoswissClimateData` tool (29 NBCN + 46 NBCN-precip stations, daily/monthly/yearly resolution)
- **PR #65** `feat/visual-observations`: Enriched `meteoswissCurrentWeather` with visual observations for 8 OBS stations
- **RC Release** `meteoswiss-mcp-v2.3.0-rc.1`: npm publish (tag `next`) + Docker image to GHCR

## Decisions

- **CSV parser library**: Chose `csv-parse/sync` over papaparse — better Node.js native support, `on_record` callback preserves filter optimization for large CSVs
- **Visual observations as enrichment, not standalone tool**: OBS data are daily aggregates (fog yes/no, cloud cover mean) for only 8 stations — too narrow for a standalone tool. Merged into `currentWeather` response instead
- **NBCN tool name**: `meteoswissClimateData` — conveys the climate reference nature of the data (homogeneous series going back decades)
- **VQHA80 overlap**: Live API check confirmed zero overlap between 192 VQHA80 stations and 248 SMN-precip stations — justified the per-station CSV fallback architecture
- **Version bump to v2.3.0**: v2.2.x was already released, so new features got v2.3.0-rc.1

## Changes Made

### PR 0: CSV Parser (commit 706e9b3)
- Modified: `src/support/ogd-csv-parser.ts` — replaced ~70-line custom parser with 15-line csv-parse wrapper
- Modified: `test/unit/ogd-csv-parser.test.ts` — removed `splitCsvLine` tests, converted to `parseCsv` tests
- Modified: `package.json` — added `csv-parse` dependency

### PR 1: SMN-Precip (commits ff2069c..366a742)
- Modified: `src/schemas/ogd-shared.ts` — added `NBCN_PRECIP` and `OBS` collection IDs
- Modified: `src/data/ogd-smn-stations.ts` — `network` discriminator, parallel metadata loading
- Modified: `src/data/ogd-current-weather.ts` — per-station CSV fallback for precip-only stations
- Modified: `src/data/ogd-data-store.ts`, `src/data/ogd-stac-client.ts` — fixture mappings
- Created: fixtures and integration test for precip-only station

### PR 2: Climate Data (commits 93d9bf6..055a4a9)
- Created: `src/schemas/ogd-climate-data.ts`, `src/data/ogd-nbcn-stations.ts`, `src/data/ogd-climate-data.ts`
- Modified: `src/server.ts` — registered `meteoswissClimateData` tool
- Modified: `test/integration/inspector.test.ts` — tool count 6 → 7
- Created: NBCN fixtures and integration tests

### PR 3: Visual Observations (commits 339ec55..e771630)
- Modified: `src/schemas/ogd-current-weather.ts` — added `visual_observations` type
- Modified: `src/data/ogd-current-weather.ts` — OBS enrichment with graceful fallback
- Modified: `src/server.ts` — updated description
- Created: OBS fixtures and integration tests

### Release (commits 615eb7a..f18b073)
- Created: `.changeset/ogd-tier1-features.md`
- Modified: `packages/meteoswiss-mcp/package.json` → v2.3.0-rc.1
- Created: GitHub release `meteoswiss-mcp-v2.3.0-rc.1`

## E2E Testing Notes (from /bye args)

Post-release E2E testing found 3 blockers:
1. Pollen tool still broken in published package
2. Location resolver returning wrong cities
3. Climate tool not discovered by LLM

These are tracked separately and not addressed in this session.

## Next Steps
- [ ] Investigate and fix 3 E2E blockers from RC testing
- [ ] Promote v2.3.0-rc.1 to stable after blockers resolved
- [ ] Re-add climate normals tool when MeteoSwiss publishes `ch.meteoschweiz.ogd-climate-normals`

## Repository State
- Branch: `main`
- Latest commit: `f18b073` — D: Add RC v2.3.0-rc.1 E2E test report and UX review
- Release: `meteoswiss-mcp-v2.3.0-rc.1` (prerelease)
- Untracked: `meteoswiss-test-report.md` (from prior session, 2026-04-03)
