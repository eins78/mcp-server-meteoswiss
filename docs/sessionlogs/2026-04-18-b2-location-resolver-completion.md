# Complete B2 — postal-code fallback, non-Swiss rejection, invalid-input errors

**Date:** 2026-04-18
**Source:** Claude Code (Opus 4.7, autonomous session via `/loop` cron)
**Plan:** `~/.claude/plans/session-brief-stateful-rainbow.md`

## Summary

Closed the remaining B2 gaps reported by the `v2.3.0-rc.2` E2E test
(`docs/research/2026-04-08-rc2-final-test-report.md`, verdict NO-GO). Every
rc.2 failure case that silently returned wrong data now either resolves
correctly or throws a helpful error matching the `meteoswissPollenData`
reference pattern.

## rc.2 failure matrix → outcome

| Input                                    | rc.2 behaviour        | After this change        |
|------------------------------------------|-----------------------|--------------------------|
| `currentWeather station="Paris"`         | Grenchen (GRE)        | helpful error            |
| `currentWeather station="NOTASTATION"`   | Chasseral (CHA)       | helpful error            |
| `localForecast location="Paris"`         | Bettlach              | helpful error            |
| `localForecast location="99999"`         | Bilten                | helpful error            |
| `localForecast location="ABCDE"`         | Grüsch                | helpful error            |
| `localForecast location="1200"`          | Cousset (46.82° N)    | Geneva-area (46.1–46.3)  |
| `localForecast location="3000"`          | Treyvaux (46.73° N)   | Bern-area (46.8–47.0)    |
| `climateData station="INVALID_STATION_XYZ"` | Winterthur/Seen (WIN) | helpful error         |

## Root cause analysis

### Why the rc.2 Swiss-bbox gate didn't stop "Paris"

rc.2 added `isInsideSwitzerland(lat, lon)` as a post-geocode filter in
`src/support/geocode.ts`. It correctly rejects genuine non-Swiss results —
but swisstopo's SearchServer (`api3.geo.admin.ch/rest/services/ech/SearchServer`)
matches against **all** origins by default: `zipcode`, `gg25`
(municipalities), `district`, `kantone`, `address`, `gazetteer`, `parcels`.
For a query like "Paris" it returns a Swiss **`address`**-origin label
(street or business containing the word "Paris", apparently near Grenchen).
The bbox passes because coordinates are Swiss. The nearest-station lookup
then returns GRE. The bbox cannot tell "Paris, France" apart from
"Rue de Paris, Grenchen".

### Why postal codes 1200 / 3000 silently degraded

`resolveForecastPoint` does an O(1) `Map.get()` on the indexed postal
codes. MeteoSwiss's `ogd-local-forecasting_meta_point.csv` only contains
per-grid-point codes, not the round-number parent codes (1200 Geneva,
3000 Bern). On a miss, the resolver fell through to geocoding +
nearest-neighbour, which returned whichever village swisstopo matched
first (Cousset, Treyvaux).

## Fix approach

Three layered changes, all small and reversible.

### 1. Geocoder origins restriction (`src/support/geocode.ts`)

Added an `origins` option to `geocodeSwissLocation(query, options)`, plus
a pure `buildGeocodeUrl(query, origins)` helper (for unit testing without
mocking `fetch`). Three presets:

- `place` — `zipcode,gg25,district,kantone` (admin / postal-code matches)
- `address` — `address` (street-address matches)
- `all` — no restriction (previous rc.2 behaviour)

Cache key now includes the preset so different origin scopes don't collide.

### 2. Query classifier (`src/support/query-classifier.ts`)

New ~25 LOC pure function. Classifies trimmed queries into three buckets:

- `postal_code` — exactly 4 digits
- `address` — 2+ whitespace-separated tokens containing at least one digit
- `place_name` — everything else

Reused by all three resolvers and two unit tests.

### 3. Resolver wiring + prefix fallback

All three resolvers (`src/data/ogd-smn-stations.ts`,
`src/data/ogd-nbcn-stations.ts`, `src/data/ogd-station-resolver.ts`)
classify the query before geocoding and pick `origins: 'address'` for
address-shaped inputs, `origins: 'place'` for everything else. This means
"Paris" can no longer match `address`-origin Swiss labels.

`resolveForecastPoint` also gained a postal-code prefix fallback
(`findPostalCodeNeighbour`): when a 4-digit query isn't in the index, we
pick the numerically closest indexed postal code sharing the same 3- or
2-digit prefix. "1200" → 1201 Genève; "3000" → 3001 Bern.

### 4. Error-message upgrade

Each resolver's "not found" error now follows the `pollenData` pattern:
quoted invalid input, up to 5 concrete examples, and a pointer to
`meteoswissStations`. Messages are:

- SMN: `No weather station found for "...". Is this a Swiss location? Examples: ... Use meteoswissStations to search by name, canton, or coordinates.`
- Forecast: `No forecast location found for "...". Try a Swiss postal code (e.g., "8001" for Zurich), station abbreviation (e.g., "BER", "SMA"), or place name (e.g., "Zurich", "Bern", "Lugano"). Use meteoswissStations to discover valid stations.`
- NBCN: `No climate station found for "...". Is this a Swiss location? Examples: ... Use meteoswissStations to browse the ~75 long-term climate stations.`

## Changes Made

### Source
- Modified `packages/meteoswiss-mcp/src/support/geocode.ts` — added `GeocodeOrigin` type, `ORIGIN_PARAMS` preset map, `GeocodeOptions`, `buildGeocodeUrl` export, threaded option through `geocodeSwissLocation`.
- Created `packages/meteoswiss-mcp/src/support/query-classifier.ts` — `QueryKind` type + `classifyQuery(q)` pure function.
- Modified `packages/meteoswiss-mcp/src/data/ogd-smn-stations.ts` — classifier-driven origins, pollenData-pattern error.
- Modified `packages/meteoswiss-mcp/src/data/ogd-nbcn-stations.ts` — same.
- Modified `packages/meteoswiss-mcp/src/data/ogd-station-resolver.ts` — classifier-driven origins, postal-code prefix fallback (`findPostalCodeNeighbour`), pollenData-pattern error.

### Tests
- Modified `packages/meteoswiss-mcp/test/integration/ogd-current-weather.test.ts` — added 2 B2 regression cases (Paris, NOTASTATION).
- Modified `packages/meteoswiss-mcp/test/integration/ogd-local-forecast.test.ts` — added 5 B2 regression cases (Paris, 99999, ABCDE, 1200, 3000) + relaxed the rc.2 "Bern" assertion to accept any Bern-area point.
- Modified `packages/meteoswiss-mcp/test/integration/ogd-climate-data.test.ts` — added 1 B2 regression case (INVALID_STATION_XYZ).
- Created `packages/meteoswiss-mcp/test/unit/geocode.test.ts` — 6 unit tests covering `buildGeocodeUrl` + `isInsideSwitzerland`.
- Created `packages/meteoswiss-mcp/test/unit/query-classifier.test.ts` — 5 unit tests covering `classifyQuery`.

### Fixtures
- Modified `packages/meteoswiss-mcp/test/__fixtures__/ogd/metadata/ogd-local-forecasting_meta_point.csv` — added 1201 Genève (46.206, 6.142) and 3001 Bern (46.948, 7.447) so the prefix-fallback tests have real targets. LV95 east/north fields set to 0 (unused in the resolver code path).

### Meta
- Added `.changeset/b2-location-resolver-completion.md` — patch bump.

## Decisions

- **Origins restriction over client-side label-filtering**: restricting the
  swisstopo query (`origins=`) prevents non-Swiss labels from ever entering
  the result set. Client-side post-filters (reject `address` origins after
  the fact) would add code complexity and still suffer from `limit=1`
  returning the wrong kind of result.
- **Trade-off: landmark/gazetteer queries**: single-word queries like
  "Matterhorn" (a mountain, `gazetteer` origin) no longer resolve via the
  geocoder. Acceptable: landmarks weren't in any rc.2 passing test, and
  `meteoswissStations` plus explicit coordinates still work. A future
  `gazetteer` preset can be added with zero restructuring.
- **Extracted `buildGeocodeUrl` as a pure helper**: ESM jest mocking of
  destructured imports is painful (`jest.spyOn` on module exports doesn't
  reliably propagate to already-bound local names). A pure URL builder
  tested directly is cleaner and avoids `--experimental-vm-modules`
  mocking gymnastics.
- **Relaxed "Bern" → BER assertion**: the new fixture adds `3001 Bern` as
  a postal code. For query "Bern" it's an exact-name match (score 100) vs
  BER's word-boundary match (score 50), so the postal code legitimately
  wins. The rc.2 test's real intent — "reject Bernina, accept Bern-area"
  — still passes. In live production data the behaviour is equivalent.
- **Did NOT add per-point forecast data** for the new 1201/3001 rows. The
  B2 prefix-fallback tests assert only on the resolved `location` block
  (coordinates, type). Adding rows to 7 forecast CSVs for a test that
  doesn't need them would be fixture bloat.
- **Did NOT revisit B3 (SIO visual observations, JUN precipitation)**.
  Out of scope per the session brief — upstream data issue, already
  handled gracefully via try/catch.

## Verification

- `pnpm run lint` — clean (TypeScript + ESLint).
- `pnpm run build` — clean.
- `pnpm test --runInBand` in worktree — **147 passed, 1 skipped, 0 failed**
  (148 total). All 20 new B2 + classifier + geocode tests pass.
- Running in parallel on macOS (`pnpm test` without `--runInBand`)
  surfaces a pre-existing port-mapping flake (`httpServer.address()`
  returning `null`) unrelated to B2 — the test file is untouched by this
  change; the flake only shows on macOS+parallel. CI (Linux) runs with
  the default Jest `maxWorkers` and has been green on recent merges.

## What rc.2 got right vs wrong

- **Right**: word-boundary name-match tiering (score 100 / 50 / 10); the
  bbox check on geocoded coordinates is still useful as a last-resort
  guard against swisstopo returning genuinely off-territory results;
  empty/whitespace input validation; distance thresholds (50/80/30 km).
- **Wrong (or incomplete)**: assumed swisstopo would return non-Swiss
  coordinates for non-Swiss queries, so a bbox gate would suffice. In
  practice swisstopo happily matches international city names against
  Swiss `address` or `gazetteer` labels — the bbox check never fired.
  Also didn't add a postal-code prefix fallback for round-number codes.

## Repository State

- Worktree branch: `worktree-meteoswiss-b2-fix` (tracks `origin/main` as
  base).
- No files outside `packages/meteoswiss-mcp/` (and `.changeset/`,
  `docs/sessionlogs/`) touched.

## Next Steps (for Max)

- [ ] Review PR, CI must be green on all 4 required checks
  (Lint/Build/Test, Security & Dependency Check, Docker Build Test,
  Skill Validation).
- [ ] Merge PR.
- [ ] Cut `v2.3.0-rc.3` pre-release using the manual changeset →
  `pnpm run version` → override → tag → GitHub-release pattern from rc.2.
- [ ] Re-run E2E tests against the TEST deployment with rc.3 — the
  live-mode behaviour (restricted swisstopo origins) can only be verified
  against a real swisstopo, not against fixtures.
- [ ] If green, promote to stable `v2.3.0`.

## Post-Merge: RC3 Release and Test Deployment

The orchestrator extended the mandate post-PR-approval — merge, cut rc.3,
publish, deploy. Completed all but the last-mile deploy (out of repo scope).

### Merge

- PR #81 merged with merge-commit style (matching rc.2's PR #66
  convention) at **2026-04-18 12:55 UTC**.
- Merge commit: **`8f0b163bb05d20fc6c0e970c2fc7a42b6eac3ee4`**.
- Remote branch `meteoswiss-b2-fix` auto-deleted via `--delete-branch`.

### Version bump and tag

- Ran `pnpm run version` on main — changesets produced a patch bump to
  `2.3.0`. Manually overrode `packages/meteoswiss-mcp/package.json` and
  `packages/meteoswiss-mcp/CHANGELOG.md` to `2.3.0-rc.3` (same manual-RC
  pattern as rc.1 and rc.2 — changesets doesn't handle RC tags natively).
- Plugin.json files (`.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`)
  left at `2.1.0` — changesets does not bump them.
- Commit **`b1023e0`**: `I: Version meteoswiss-mcp v2.3.0-rc.3`
  (Arlo notation per repo convention — matches rc.2 commit `6e14e21`).
- Tag: **`meteoswiss-mcp-v2.3.0-rc.3`** (annotated, pushed).
- GitHub pre-release: https://github.com/eins78/meteoswiss-llm-tools/releases/tag/meteoswiss-mcp-v2.3.0-rc.3

### CI + publish (run ID 24605209041 — "Release MCP Server")

All three jobs succeeded:

- **CI Validation** ✅ — lint, build, test, integration tests
- **Publish to npm** ✅ — `meteoswiss-mcp@2.3.0-rc.3` on `next` dist-tag
  (per workflow's `prerelease=true` branch)
- **Publish to GHCR** ✅ — `ghcr.io/eins78/meteoswiss-mcp:2.3.0-rc.3`
  (amd64 + arm64). Image confirmed via
  `gh api /users/eins78/packages/container/meteoswiss-mcp/versions` —
  top version tagged `2.3.0-rc.3`, digest `sha256:d8c2f97c68d229…`.
  Per `.github/workflows/release.yml` lines 167–174, pre-releases do
  **not** also push `:latest` (that's prod-stable-only), and the
  workflow does not maintain any floating `:next`/`:rc` Docker tag —
  only the exact semver tag goes to GHCR.

### Test environment deploy — documented gap

**Not executed by this session.** Verified from `curl https://meteoswiss-mcp-demo-test.cloud.kiste.li/health`
at 2026-04-18 ~13:10 UTC: test env still reports `version: "2.3.0-rc.2"`.

Per project reference memory (`reference_deployment.md`):

> "Deployment is manual: pull new GHCR image locally, restart compose."
> "Compose (prod): ~/Docker/selfhosted/docker-compose.yaml"

The test environment's compose file pins a specific version tag (not a
floating one — confirmed by the fact that rc.2 → rc.3 doesn't happen
automatically after GHCR publish). Updating that tag from `:2.3.0-rc.2`
to `:2.3.0-rc.3` plus running `docker compose pull && docker compose up -d`
on `mac-zrh` is the standard mechanism.

I did not execute the deploy because `~/Docker/selfhosted/` is outside
the meteoswiss-mcp repo scope and my permissions were explicitly denied
for searching that directory (per mandate: "DO NOT invent SSH or API
calls"). The deploy step is left for Max / the orchestrator.

**What Max (or orchestrator) needs to do on `mac-zrh`:**

1. Edit the test-env compose file to bump the `meteoswiss-mcp` service
   image from `ghcr.io/eins78/meteoswiss-mcp:2.3.0-rc.2` to
   `ghcr.io/eins78/meteoswiss-mcp:2.3.0-rc.3`.
2. `docker compose pull meteoswiss-mcp && docker compose up -d meteoswiss-mcp`
   (or equivalent per the test-env compose layout).
3. Verify: `curl https://meteoswiss-mcp-demo-test.cloud.kiste.li/health`
   should report `version: "2.3.0-rc.3"`.

### Final state

| Artefact | Identifier | Status |
|---|---|---|
| Merge commit | `8f0b163bb05d20fc6c0e970c2fc7a42b6eac3ee4` | ✅ on main |
| Version bump | `b1023e08f169aa27a85f9e686cd2dd881f652493` | ✅ on main |
| Git tag | `meteoswiss-mcp-v2.3.0-rc.3` (annotated) | ✅ pushed |
| GitHub release | `meteoswiss-mcp-v2.3.0-rc.3` (prerelease, auto notes) | ✅ published |
| npm | `meteoswiss-mcp@2.3.0-rc.3` on `next` dist-tag | ✅ published |
| GHCR | `ghcr.io/eins78/meteoswiss-mcp:2.3.0-rc.3` (amd64+arm64) | ✅ published |
| Test env | `meteoswiss-mcp-demo-test.cloud.kiste.li` | ⚠️ still on rc.2 — manual deploy needed |
| Prod env | `meteoswiss-mcp.ars.is` — intentionally untouched | (stays on v2.2.1) |

### What's explicitly NOT done (per mandate)

- Production deployment to `meteoswiss-mcp.ars.is` — stays on v2.2.1
  until Max promotes.
- Stable `v2.3.0` promotion — Max re-tests rc.3 first, then promotes.
- Renovate PRs #71 (@types/jsdom v28) and #79 (jsdom v29) — separate
  concerns.
