# rc.4 Fixes and Release Session

**Date:** 2026-04-18
**Model:** Claude Sonnet 4.6 (worktree `meteo-rc4`)

## Fixes Applied

### B2-4 + B2-5: Paris false-positive (currentWeather + localForecast)

- **Root cause:** swisstopo `gg25` layer contains "Paris" as a legitimate Swiss hamlet in the municipality of Lucens, Canton Vaud (~100 people, ~3 km from Payerne). The `origins='place'` restriction (zipcode/gg25/district/kantone) correctly blocks Paris, France but still matches Paris, VD. The Swiss bounding box check also correctly accepts Paris-VD as within Switzerland. So `currentWeather "Paris"` returned PAY (Payerne) and `localForecast "Paris"` returned Prez-vers-Noréaz.
- **Fix:** `INTERNATIONAL_CITY_BLOCKLIST` in `src/support/location-blocklist.ts`. Applied at the top of `resolveSmnStation` (currentWeather) and `resolveForecastPoint` (localForecast), before any name lookup or geocoding.
- **Blocklist members:** paris, berlin, london, tokyo, beijing, moscow, madrid, rome, new york, los angeles, sydney, mumbai, delhi, cairo, istanbul, bangkok, toronto, budapest, stockholm, oslo, copenhagen, helsinki, athens, lisbon, dublin, brussels, amsterdam, barcelona, buenos aires, mexico city, sao paulo, rio de janeiro
- **Decision rationale:** Pure blocklist (no population threshold). A population threshold requires the geocoder to return population metadata, which swisstopo doesn't provide. The blocklist is adequate for the primary use case (blocking major international cities) and can be extended as needed.
- **Fix loops:** 1 iteration

### B2-6: NOTASTATION silent return (currentWeather)

- **Root cause:** Live swisstopo API fuzzy-matches "NOTASTATION" to some Swiss coordinate (Chasseral area). The `scoreNameMatch` function correctly returns 0 for all SMN station names (no station contains "notastation" as substring), but `resolveSmnStation` was calling `findNearestStation` on the geocoded coordinate without checking whether the geocoded place name actually resembles the user's query. So any geocoding hit, even for gibberish, would produce a station result.
- **Fix:** Post-geocoding name-match guard `geocodedNameMatchesQuery(query, geocodedName)`. If the user's query tokens don't appear in the geocoded place name (or vice versa, tokens ≥ 3 chars), the geocoding result is rejected. Applied in both `ogd-smn-stations.ts` and `ogd-station-resolver.ts`.
- **How it works:** Split both query and geocoded name on whitespace, filter tokens < 3 chars, check substring overlap in either direction. "NOTASTATION" → tokens ["notastation"]; geocoded name e.g. "Chasseral" → tokens ["chasseral"]. No overlap → rejected.
- **Fix loops:** 1 iteration

### fetch `id` → `url` revert

- **Root cause:** Commit `b1850b5` renamed the `fetch` tool schema parameter from `url` to `id` while updating the description text ("must be full URL from search results"). The rename was incidental to the description update, not a deliberate semantic change — semantically inconsistent (a parameter named `id` holding a URL).
- **Fix:** Reverted `id` → `url` in `src/schemas/meteoswiss-fetch.ts` and updated all usages (`src/tools/meteoswiss-fetch.ts`, `src/server.ts`, `src/data/meteoswiss-content-data.ts`). Response `ContentResponse.id` field retained for backward compatibility.
- **Fix loops:** 1 iteration

### jest.config.js worktree exclusion fix

- **Root cause:** `testPathIgnorePatterns: ['/.claude/']` excluded ALL test files in the worktree (which lives at `.../mcp-server-meteoswiss/.claude/worktrees/meteo-rc4/`). Jest found 0 test files until this was corrected.
- **Fix:** Narrowed pattern to `['/.claude/plugins/', '/.claude/skills/']` to preserve the intent (block plugin test files) without blocking worktree files.

## Test Results

### Integration tests added/modified
- `test/unit/location-blocklist.test.ts` (new): 12 assertions across 4 describe blocks
- `test/integration/ogd-current-weather.test.ts`: Updated Paris assertions, +5 cases (Berlin, London, Tokyo, ZZZZZZ, 1234567890)
- `test/integration/ogd-local-forecast.test.ts`: Updated Paris assertions, +2 cases (London, Berlin)
- `test/integration/meteoswiss-fetch.test.ts`: Updated all `id:` → `url:` call parameters and schema assertions
- Total: 20 test suites, 163 passing (2 skipped: port-mapping macOS flake, documented)

### Local dev server verification (live geocoder, 2026-04-18 ~16:50 CEST)

| Query | Expected | Result |
|-------|----------|--------|
| `currentWeather "Paris"` | isError + international city | ✅ `"Paris" is a well-known international city name...` |
| `currentWeather "NOTASTATION"` | isError + no station found | ✅ `No weather station found for "NOTASTATION"...` |
| `localForecast "Paris"` | isError + international city | ✅ `"Paris" is a well-known international city name...` |
| `currentWeather "Bern"` | BER, Bern/Zollikofen | ✅ BER, 20.9°C |
| `currentWeather "SMA"` | SMA, Zürich/Fluntern | ✅ SMA, 21.1°C |
| `localForecast "8001"` | Zürich postal code, 3 days | ✅ postal_code, 3 days |
| `localForecast "Zermatt"` | Zermatt, 3 days | ✅ postal_code, 3 days |
| `fetch url:` wind.html | content, title "Wind" | ✅ 1129 chars, title "Wind" |

## Release

- Changeset: `.changeset/rc4-blocklist-fixes.md`
- Version commit: `546ad47` (I: Version meteoswiss-mcp v2.3.0-rc.4)
- Tag: `meteoswiss-mcp-v2.3.0-rc.4`
- GitHub release: https://github.com/eins78/meteoswiss-llm-tools/releases/tag/meteoswiss-mcp-v2.3.0-rc.4
- GHCR image: `ghcr.io/eins78/meteoswiss-mcp:2.3.0-rc.4`
- Publish workflow run: 24607560021 (success)

## Deploy

- Deploy command: `~/Docker/selfhosted/scripts/meteoswiss-deploy.sh test 2.3.0-rc.4`
- Health check response: `{"status":"ok","version":"2.3.0-rc.4","sessions":0,"endpoint":"https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp"}`
- Deploy verification: 2026-04-18T17:19:21Z — health check passed on attempt 1
