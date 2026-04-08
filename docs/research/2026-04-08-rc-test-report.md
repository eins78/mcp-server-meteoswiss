# MeteoSwiss MCP Server v2.3.0-rc.1 — RC Test Report

**Date**: 2026-04-08  
**Tester**: Claude Opus 4.6 (automated E2E)  
**Package**: `meteoswiss-mcp@next` (v2.3.0-rc.1 via npm)  
**Verdict**: **NO-GO** — 3 release blockers identified

---

## Executive Summary

| Tool | Tests | Passed | Failed | Blockers |
|------|-------|--------|--------|----------|
| meteoswissStations | 10 | 10 | 0 | 0 |
| meteoswissCurrentWeather | 15 | 12 | 3 | 1 |
| meteoswissLocalForecast | 12 | 7 | 5 | 1 |
| meteoswissPollenData | 5 | 2 | 3 | 1 |
| search | 6 | 5 | 1 | 0 |
| fetch | 5 | 5 | 0 | 0 |
| **meteoswissClimateData** | — | — | — | **MISSING** |
| **TOTAL** | **53** | **41** | **12** | **3 + 1 missing tool** |

---

## RELEASE BLOCKERS

### BLOCKER 1: Pollen data is unusable

**Severity**: Critical — tool returns data that an LLM cannot interpret

The `meteoswissPollenData` tool returns pollen concentrations without species identification. Every entry has the same `type` field — a French technical description of the measurement window — instead of the species name (Birch, Alder, etc.).

**Actual response (Bern station):**
```json
{
  "type": "concentration pollinique journalière moyenne 6 UTC - 6 UTC du jour suivant\"",
  "value": 875,
  "unit": "particles/m³"
}
```

**Expected:**
```json
{
  "species": "Birch",
  "value": 875,
  "unit": "particles/m³",
  "measurement_window": "6 UTC - 6 UTC"
}
```

Sub-issues:
- **No species names**: All 7 pollen values per measurement window are indistinguishable. An LLM cannot tell which value is Birch vs Alder vs Grasses.
- **French, not English**: `"concentration pollinique journalière moyenne"` is French. The rest of the server uses English.
- **Trailing escaped quote**: Type strings end with `\"` — a JSON parsing artifact.
- **d0/d1 near-duplicates**: Each station returns 14 entries (7 × 2 measurement windows) with no clear indication of which window is "current" vs "yesterday".
- **Variable entry count**: Most stations have 14 entries but Luzern has only 12 — no explanation.
- **Timestamp format**: Uses `"07.04.2026 00:00"` (DD.MM.YYYY) — a third format, inconsistent with the other tools.

### BLOCKER 2: Location resolver silently returns wrong data

**Severity**: Critical — users receive incorrect weather data with no warning

Both `meteoswissCurrentWeather` and `meteoswissLocalForecast` silently resolve invalid or ambiguous inputs to unrelated locations instead of returning errors.

| Tool | Input | Expected | Actual |
|------|-------|----------|--------|
| CurrentWeather | `"NOTASTATION"` | Error | Chasseral (CHA) — unrelated station |
| LocalForecast | `"99999"` (invalid postal code) | Error | Bilten (GL) |
| LocalForecast | `"Paris"` (non-Swiss) | Error | Bettlach (SO) |
| LocalForecast | `"1200"` (Geneva postal code) | Genève | Cousset (FR) — wrong city |
| LocalForecast | `"3000"` (Bern postal code) | Bern | Treyvaux (FR) — wrong city |

The `1200` → Cousset and `3000` → Treyvaux cases are the most dangerous: these are valid, major Swiss postal codes resolving to wrong towns ~50-100km away. Users asking "what's the forecast for Geneva?" would receive data for a Fribourg village.

**Contrast with pollen**: `meteoswissPollenData` handles invalid input correctly:
```
Failed to get pollen data: No pollen station found for "NOTASTATION". 
Available: PBE (Bern), PBS (Basel), ...
```

### BLOCKER 3: OBS stations missing visual observation data

**Severity**: High — advertised capability not delivered

All 8 OBS stations (ALT, BAS, CHU, GSB, JUN, SAE, SIO, SMA) return only automatic instrument measurements. Visual observation fields (cloud cover, visibility, present weather) are completely absent. The response structure for OBS stations is identical to non-OBS stations.

Tested all 8: ALT ✗, BAS ✗, CHU ✗, GSB ✗, JUN ✗, SAE ✗, SIO ✗, SMA ✗

This data IS available in the MeteoSwiss OGD API but the MCP server does not expose it.

---

## MISSING TOOL: meteoswissClimateData

The RC was expected to include a `meteoswissClimateData` tool for NBCN homogeneous climate series. Only 6 tools are registered. Verified via ToolSearch — no climate-related tool exists.

**Decision needed**: Is this a known deferral or an oversight?

---

## Detailed Test Results

### 1. meteoswissStations — 10/10 PASS ✅

| Test | Input | Result |
|------|-------|--------|
| No params (default) | `{}` | 20 of 158 stations returned ✅ |
| Canton ZH | `{canton: "ZH"}` | 8 stations, all ZH ✅ |
| Canton GR | `{canton: "GR"}` | 26 total, 20 returned (limit) ✅ |
| Search "Zurich" | `{search: "Zurich"}` | 3 stations (KLO, REH, SMA) — handles umlauts ✅ |
| Search "SMA" | `{search: "SMA"}` | Exact match: Zürich/Fluntern ✅ |
| Combined filter | `{canton: "ZH", search: "Kloten"}` | KLO returned ✅ |
| Limit 1 | `{limit: 1}` | Exactly 1 result ✅ |
| Limit 200 (full dump) | `{limit: 200}` | All 158 stations ✅ |
| No match | `{search: "xyznonexistent"}` | Empty array, no error ✅ |
| Invalid canton | `{canton: "XX"}` | Empty array, no error ✅ |

**Notes:**
- Network has 158 stations (description says "~160" — acceptable)
- Includes Vaduz (FL/Liechtenstein) — worth mentioning in docs
- Invalid canton `XX` returns empty results with no error — would be better to warn

### 2. meteoswissCurrentWeather — 12/15 PASS

#### Happy path — all pass ✅

| Test | Input | Resolved To | Notes |
|------|-------|-------------|-------|
| Abbreviation | `{station: "SMA"}` | Zürich/Fluntern | Full measurements, timestamp 202604081530 |
| Name | `{station: "Zurich"}` | Zürich/Kloten (KLO) | ⚠️ Resolves to airport, not city center |
| Address | `{station: "Bahnhofplatz 1 Bern"}` | Bern/Zollikofen (BER) | Address resolution works |
| Coordinates | `{coordinates: {lat: 47.38, lon: 8.57}}` | SMA, distance_km: 0.4 | Includes distance field |
| Boundary SW | `{coordinates: {lat: 45.5, lon: 5.9}}` | GVE, distance_km: 85 | Works outside Switzerland |
| Boundary NE | `{coordinates: {lat: 48, lon: 10.6}}` | ARH, distance_km: 96.3 | Works outside Switzerland |

#### Edge cases — 3 failures

| Test | Input | Result | Verdict |
|------|-------|--------|---------|
| No params | `{}` | `Either "station" or "coordinates" must be provided` | ✅ PASS |
| Invalid station | `{station: "NOTASTATION"}` | Returned Chasseral data | ❌ FAIL — see Blocker 2 |
| Both params | `{station: "SMA", coordinates: {...}}` | Coordinates take priority, returns SMA | ✅ PASS |
| Out-of-range lat | `{coordinates: {lat: 44, lon: 8}}` | Zod validation error | ✅ PASS |
| OBS stations (8 tested) | ALT, BAS, CHU, GSB, JUN, SAE, SIO, SMA | No visual obs fields | ❌ FAIL — see Blocker 3 |

#### Measurement data quality ✅
- Temperature, humidity, dew_point, precipitation, wind_speed, wind_gust, wind_direction, sunshine, radiation, pressure_station present
- pressure_sea_level omitted at high altitude (JUN 3571m, GSB 2472m, SAE 2501m) — correct behavior
- Units explicit and consistent (°C, %, mm, km/h, °, min, W/m², hPa)
- Timestamp within expected range

### 3. meteoswissLocalForecast — 7/12 PASS

#### Happy path ✅

| Test | Input | Result |
|------|-------|--------|
| Postal code 8001 | `{location: "8001"}` | Zürich, 5 days, today-first ✅ |
| Place name | `{location: "Bern"}` | Bern, 5 days ✅ |
| Station abbrev | `{location: "ZUE"}` | Zürich (resolved as postal_code) ✅ |
| Italian region | `{location: "Lugano"}` | Lugano ✅ |
| days=1 | `{location: "8001", days: 1}` | Exactly 1 day ✅ |
| days=9 | `{location: "8001", days: 9}` | Exactly 9 days (Apr 8-16) ✅ |
| days=3 | `{location: "8001", days: 3}` | Exactly 3 days ✅ |

#### Stale-day check ✅
First day in all responses is `2026-04-08` (today) with valid weather data. **No stale-day bug.**

#### Failures

| Test | Input | Expected | Actual | Verdict |
|------|-------|----------|--------|---------|
| Geneva | `{location: "1200"}` | Genève | Cousset (FR) | ❌ Wrong city |
| Bern | `{location: "3000"}` | Bern | Treyvaux (FR) | ❌ Wrong city |
| Invalid postal | `{location: "99999"}` | Error | Bilten (GL) | ❌ Silent wrong data |
| Non-Swiss | `{location: "Paris"}` | Error | Bettlach (SO) | ❌ Silent wrong data |

#### Data quality ✅
- Weather descriptions in English ("sunny", "high clouds", "overcast and dry", "very cloudy, light rain")
- Temperature min/max with units
- Precipitation total with units
- Weather icon SVG URLs functional
- `generated` timestamp in ISO 8601 format

### 4. meteoswissPollenData — 2/5 PASS

| Test | Input | Result | Verdict |
|------|-------|--------|---------|
| All stations | `{}` | 16 stations returned | ✅ (partial — data is broken but station list works) |
| Single station | `{station: "Zurich"}` | PZH returned | ✅ (station resolution works) |
| Basel | `{station: "Basel"}` | PBS returned | ✅ |
| Invalid station | `{station: "NOTASTATION"}` | Error with available list | ✅ Excellent error message |
| Weather station | `{station: "SMA"}` | Error with available list | ✅ Excellent error message |

**All pollen data content is broken** — see Blocker 1. The station resolution and error handling work well; the data payload is the problem.

### 5. search — 5/6 PASS

| Test | Input | Result | Verdict |
|------|-------|--------|---------|
| German (default) | `{query: "Klimawandel"}` | 437 results | ✅ |
| English | `{query: "climate change", language: "en"}` | 125 results | ✅ |
| French | `{query: "changement climatique", language: "fr"}` | 120 results | ✅ |
| Italian | `{query: "cambiamento climatico", language: "it"}` | 106 results | ✅ |
| Press releases | `{query: "Unwetter", contentType: "press-release"}` | 45 results, correct type | ✅ |
| pageSize=3 | `{query: "Niederschlag", pageSize: 3}` | Response claims pageSize=3 but returned 10 results | ❌ BUG |
| No results | `{query: "xyznonexistent123"}` | `totalResults: 0, results: []` | ✅ |

### 6. fetch — 5/5 PASS ✅

| Test | Input | Result | Verdict |
|------|-------|--------|---------|
| Markdown (default) | Rising temperatures URL | Rich markdown with headings, links, images | ✅ |
| Text format | Same URL, format: "text" | Plain text, no markdown syntax | ✅ |
| includeMetadata: false | Same URL | No metadata in response | ✅ |
| Non-existent page | Fake MeteoSwiss URL | `"Content not found... Use the search tool"` | ✅ |
| Non-MeteoSwiss URL | google.com | `"Invalid domain... Only MeteoSwiss domains"` | ✅ |

---

## WARNINGS (non-blocking)

### W1: Timestamp format inconsistency
Three different formats across tools:
- `meteoswissCurrentWeather`: `"202604081530"` (compact, non-standard)
- `meteoswissLocalForecast`: `"2026-04-08T04:00:35.659886Z"` (ISO 8601 ✅)
- `meteoswissPollenData`: `"07.04.2026 00:00"` (DD.MM.YYYY European)

**Recommendation**: Standardize on ISO 8601 everywhere.

### W2: "Zurich" resolves to airport (KLO) not city center (SMA)
When a user says "Zurich", they likely mean the city center, not the airport in Kloten. The station `SMA` (Zürich/Fluntern) is the canonical city station.

### W3: search pageSize parameter not honored
`pageSize: 3` returns more results than requested. Response metadata shows `pageSize: 3` but the results array contains 10 items.

### W4: search `description` and `lead` fields are often identical
Redundant data — wastes LLM context tokens.

### W5: Icon class names leak through in fetch text mode
Fetch in text mode includes CSS icon names as literal text: "chevron-left", "chevron-right", "arrow-up-right", "favorite".

### W6: No SMN-precip (rain-only) stations accessible
The tool description mentions ~160 stations. The actual network is 158 SMN stations. The +248 SMN-precip rain-only stations appear not to be accessible through any tool.

---

## Test Environment
- **Machine**: mac-zrh (Mac Mini M4 Pro)
- **MCP Config**: `npx -y meteoswiss-mcp@next`
- **Version confirmed**: 2.3.0-rc.1 (via `npm view meteoswiss-mcp@next version`)
- **Test time**: 2026-04-08 15:30-17:30 CEST
- **Weather during test**: 21.4°C at SMA (Zürich), sunny — good conditions for verifying data plausibility
