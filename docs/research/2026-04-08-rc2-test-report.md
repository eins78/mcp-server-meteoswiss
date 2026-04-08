# MeteoSwiss MCP Server v2.3.0-rc.1 — E2E Test Report

**Date**: 2026-04-08  
**Tester**: Claude Opus 4.6 (automated E2E)  
**Endpoint**: `https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp` (TEST)  
**Verdict**: **NO-GO** — 1 release blocker unresolved, 1 partially fixed, 1 regression

---

## Executive Summary

| Tool | Tests | Passed | Failed | Blockers |
|------|-------|--------|--------|----------|
| meteoswissStations | 12 | 12 | 0 | 0 |
| meteoswissCurrentWeather | 23 | 15 | 8 | 1 (location resolver) |
| meteoswissLocalForecast | 14 | 9 | 5 | 1 (location resolver) |
| meteoswissPollenData | 7 | 7 | 0 | 0 (**BLOCKER 1 FIXED**) |
| meteoswissClimateData (**NEW**) | 18 | 14 | 4 | 1 (location resolver) |
| search | 14 | 8 | 6 | 0 |
| fetch | 6 | 5 | 1 | 0 |
| **TOTAL** | **94** | **70** | **24** | **1 systemic blocker** |

### Previous Blockers Status

| Blocker | Previous Status | RC Status |
|---------|----------------|-----------|
| B1: Pollen data unusable (no species names) | CRITICAL | **FIXED** ✅ |
| B2: Location resolver returns wrong data silently | CRITICAL | **STILL BROKEN** ❌ |
| B3: OBS stations missing visual observations | HIGH | **PARTIALLY FIXED** ⚠️ (4/8 full, 3 partial, 1 missing) |
| Missing: meteoswissClimateData tool | MISSING | **ADDED** ✅ |

### New Issues Found in RC

| Issue | Severity |
|-------|----------|
| "Bern" → Passo del Bernina (BEH) in currentWeather | HIGH (regression?) |
| Climate data daily resolution only ~3 months, not "decades" | MEDIUM |
| Priority conflict: station wins in currentWeather, coordinates win in climateData | MEDIUM |
| Malformed dates silently return empty data in climateData | LOW |

---

## RELEASE BLOCKER: Location Resolver Silently Returns Wrong Data

**Severity**: Critical — affects 3 of 7 tools  
**Status**: Unchanged from PROD v2.2.1  

The location/station resolver across `meteoswissCurrentWeather`, `meteoswissLocalForecast`, and the new `meteoswissClimateData` silently resolves invalid or ambiguous inputs to unrelated locations instead of returning errors.

### Evidence

| Tool | Input | Expected | Actual |
|------|-------|----------|--------|
| currentWeather | `"NOTASTATION"` | Error | Chasseral (CHA) |
| currentWeather | `"Paris"` | Error | Grenchen (GRE) |
| currentWeather | `"Bern"` | Bern/Zollikofen (BER) | **Passo del Bernina (BEH)** ← NEW |
| localForecast | `"1200"` (Geneva) | Genève | Cousset (FR) |
| localForecast | `"3000"` (Bern) | Bern | Treyvaux (FR) |
| localForecast | `"99999"` | Error | Bilten (GL) |
| localForecast | `"Paris"` | Error | Bettlach (SO) |
| localForecast | `"   "` (whitespace) | Error | Lausanne 25 |
| climateData | `"NOTASTATION"` | Error | Chaumont (CHM) |

**The "Bern" → Bernina case is new**: the Swiss capital city name resolves to a mountain pass in Graubünden (2260m elevation). Address geocoding (`"Bahnhofplatz 1 Bern"`) and place name input in localForecast (`"Bern"`) both resolve correctly, so the bug is specific to the currentWeather station name resolver.

**Contrast with pollen tool**: `meteoswissPollenData` handles invalid input correctly:
```
Failed to get pollen data: No pollen station found for "NOTASTATION". 
Available: PBE (Bern), PBS (Basel), ...
```

---

## OBS Visual Observations — Partially Fixed

**Previous**: All 8 OBS stations returned zero visual observation fields.  
**RC**: 4 stations return full data, 3 return partial data, 1 returns nothing.

| Station | Fields (of 10) | Status |
|---------|---------------|--------|
| ALT (Altdorf) | 10/10 | ✅ Full |
| BAS (Basel) | 10/10 | ✅ Full |
| CHU (Chur) | 10/10 | ✅ Full |
| JUN (Jungfraujoch) | 10/10 | ✅ Full |
| GSB (Grand St-Bernard) | 5/10 | ⚠️ Missing: has_rain, has_rain_and_snow, has_snowfall, has_hail, has_fog |
| SMA (Zürich) | 4/10 | ⚠️ Missing: has_rain, has_rain_and_snow, has_snowfall, has_hail, has_fog, has_snow_coverage |
| SAE (Säntis) | 2/10 | ⚠️ Only: date, has_snow_coverage |
| SIO (Sion) | 0/10 | ❌ No visual_observations key at all |

Full OBS response example (ALT):
```json
{
  "date": "2026-04-07",
  "cloud_cover_percent": 13,
  "is_clear_day": true,
  "is_overcast_day": false,
  "has_rain": false,
  "has_rain_and_snow": false,
  "has_snowfall": false,
  "has_hail": false,
  "has_fog": false,
  "has_snow_coverage": false
}
```

**Issue**: The inconsistency appears to be sparse encoding — boolean `false` fields are omitted for some stations but included for others. This should be normalized: either always include all fields, or document the sparse convention.

---

## Detailed Test Results

### 1. meteoswissStations — 12/12 PASS ✅

| Test | Input | Result |
|------|-------|--------|
| No params | `{}` | total: 299, returned 20 (default limit) ✅ |
| Canton ZH | `{canton: "ZH"}` | 19 stations, all ZH ✅ |
| Canton GR | `{canton: "GR"}` | 41 total, 20 returned (limit) ✅ |
| Canton BE | `{canton: "BE"}` | 32 total, 20 returned (limit) ✅ |
| Invalid canton XX | `{canton: "XX"}` | Empty results, no error ✅ |
| Search "Zurich" | `{search: "Zurich"}` | 3 matches (KLO, REH, SMA) — umlaut-aware ✅ |
| Search "SMA" | `{search: "SMA"}` | 2 matches (SMA + VSMAT substring) ✅ |
| No match | `{search: "xyznonexistent"}` | Empty ✅ |
| Combined | `{canton: "ZH", search: "Kloten"}` | KLO ✅ |
| Limit 1 | `{limit: 1}` | Exactly 1 ✅ |
| Full dump | `{limit: 200}` | 299 total, 200 returned (max cap) ✅ |
| Empty search | `{search: ""}` | Same as no filter ✅ |

**Key changes from PROD**:
- **Station count: 299** (was 158). Precipitation-only stations now included.
- Liechtenstein: 3 stations (VAD, MAL, SUA) under canton code "FL"
- No `station_type` field to distinguish full vs precip-only stations. Heuristic: longer abbreviations (AGATT, VSMAT) are precip-only.
- 99 stations unreachable: limit max is 200 but total is 299. No offset/pagination.

Sample station structure:
```json
{
  "abbreviation": "SMA",
  "name": "Zurich / Fluntern",
  "canton": "ZH",
  "elevation": 556,
  "coordinates": { "lat": 47.377925, "lon": 8.565742 },
  "data_since": "01.01.1864"
}
```

### 2. meteoswissCurrentWeather — 15/23 PASS

#### Happy path (6/8 pass)

| Test | Input | Resolved To | Notes |
|------|-------|-------------|-------|
| Abbreviation | `{station: "SMA"}` | Zürich/Fluntern ✅ | Full measurements + OBS (partial) |
| Name "Zurich" | `{station: "Zurich"}` | Kloten (KLO) ⚠️ | Airport, not city center |
| Name "Bern" | `{station: "Bern"}` | **Passo del Bernina (BEH)** ❌ | Mountain pass, not capital |
| Name "Lugano" | `{station: "Lugano"}` | Lugano (LUG) ✅ | Correct |
| Address | `{station: "Bahnhofplatz 1 Bern"}` | Bern/Zollikofen (BER) ✅ | Address geocoding works |
| Coordinates ZH | `{coordinates: {lat: 47.38, lon: 8.57}}` | SMA, 0.4 km ✅ | |
| Boundary SW | `{coordinates: {lat: 45.5, lon: 5.9}}` | GVE, 85 km ✅ | |
| Boundary NE | `{coordinates: {lat: 48, lon: 10.6}}` | ARH, 96.3 km ✅ | |

#### Blocker retests (0/2 pass)

| Test | Input | Expected | Actual |
|------|-------|----------|--------|
| Invalid | `"NOTASTATION"` | Error | Chasseral (CHA) data ❌ |
| Non-Swiss | `"Paris"` | Error | Grenchen (GRE) data ❌ |

#### OBS stations (5/8 pass — see table above)

#### Precip-only station test ✅

```json
{
  "station": { "name": "Attelwil", "abbreviation": "AGATT", "network": "smn-precip" },
  "timestamp": "07.04.2026 23:50",
  "measurements": {
    "precipitation": { "value": 0, "unit": "mm" }
  }
}
```

Precip-only stations correctly return only rainfall data. `network: "smn-precip"` distinguishes them from full `"smn"` stations.

#### Edge cases (3/3 pass)

| Test | Result |
|------|--------|
| No params `{}` | Error: `Either "station" or "coordinates" must be provided` ✅ |
| Both params | Station takes priority ✅ |
| Out-of-range coords | Zod validation error ✅ |

#### Measurement fields (11 present on full stations)
temperature, humidity, dew_point, precipitation, wind_speed, wind_gust, wind_direction, sunshine, radiation, pressure_station, pressure_sea_level

### 3. meteoswissLocalForecast — 9/14 PASS

#### Happy path (7/7 pass)

| Test | Input | Location Returned | Days |
|------|-------|-------------------|------|
| Postal 8001 | `{location: "8001"}` | Zürich ✅ | 5 |
| Place "Bern" | `{location: "Bern"}` | Bern ✅ | 5 |
| Place "Lugano" | `{location: "Lugano"}` | Lugano ✅ | 5 |
| Place "Davos" | `{location: "Davos"}` | Davos ✅ | 5 |
| Station "ZUE" | `{location: "ZUE"}` | Zürich ✅ | 5 |
| days=1 | `{location: "8001", days: 1}` | Zürich | 1 ✅ |
| days=9 | `{location: "8001", days: 9}` | Zürich | 9 (Apr 8-16) ✅ |

#### Blocker retests (0/5 pass)

| Test | Input | Expected | Actual |
|------|-------|----------|--------|
| Postal 3000 | `{location: "3000"}` | Bern | **Treyvaux** ❌ |
| Postal 1200 | `{location: "1200"}` | Genève | **Cousset** ❌ |
| Invalid 99999 | `{location: "99999"}` | Error | Bilten (GL) ❌ |
| Non-Swiss Paris | `{location: "Paris"}` | Error | Bettlach (SO) ❌ |
| Whitespace | `{location: "   "}` | Error | Lausanne 25 ❌ |

**Note**: Place name "Bern" resolves correctly, but postal code "3000" does not. This suggests the postal code lookup table is flawed, not the geocoder.

#### Stale-day check ✅
First forecast day is 2026-04-08 (today). No stale-day bug.

#### Forecast day structure
```json
{
  "date": "2026-04-08",
  "temperature": { "min": 9.8, "max": 22.8, "unit": "°C" },
  "precipitation": { "total": 0, "unit": "mm" },
  "weather": "sunny",
  "weather_icon_url": "https://www.meteoschweiz.admin.ch/static/resources/weather-symbols/1.svg"
}
```
- Weather descriptions in English ✅
- `generated` timestamp: ISO 8601 ✅ (`2026-04-08T04:00:35.659886Z`)

### 4. meteoswissPollenData — 7/7 PASS ✅ (BLOCKER 1 FIXED)

| Test | Input | Result |
|------|-------|--------|
| All stations | `{}` | 16 stations with full pollen data inline ✅ |
| Zurich | `{station: "Zurich"}` | PZH, 7 species with English names ✅ |
| Basel | `{station: "Basel"}` | PBS, 7 species, consistent structure ✅ |
| Bern (abbreviation) | `{station: "PBE"}` | Direct lookup works ✅ |
| Luzern | `{station: "Luzern"}` | PLZ, 6 species (Oak missing — station doesn't measure it) ✅ |
| Invalid | `{station: "NOTASTATION"}` | Error with all 16 stations listed ✅ |
| Weather station | `{station: "SMA"}` | Error with pollen station list ✅ |

**Blocker 1 fix confirmed:**
```json
{
  "pollen": [
    { "type": "Alder (Alnus)", "value": 0, "unit": "particles/m³" },
    { "type": "Birch (Betula)", "value": 1124, "unit": "particles/m³" },
    { "type": "Hazel (Corylus)", "value": 0, "unit": "particles/m³" },
    { "type": "Beech (Fagus)", "value": 29, "unit": "particles/m³" },
    { "type": "Ash (Fraxinus)", "value": 27, "unit": "particles/m³" },
    { "type": "Oak (Quercus)", "value": 676, "unit": "particles/m³" },
    { "type": "Grasses (Poaceae)", "value": 0, "unit": "particles/m³" }
  ]
}
```

All previous sub-issues resolved:
- ✅ Species names present (English + Latin binomial)
- ✅ No French text
- ✅ No trailing escaped quotes
- ✅ No d0/d1 duplicates (single measurement per species)
- ✅ Consistent entry counts per station capability (Luzern: 6, all others: 7)

### 5. meteoswissClimateData (NEW) — 14/18 PASS

#### Happy path (7/7 pass)

| Test | Input | Result |
|------|-------|--------|
| No params | `{}` | Error: `Either "station" or "coordinates" must be provided` ✅ |
| Name "Zurich" | `{station: "Zurich"}` | SMA, 30 monthly rows ✅ |
| Abbreviation "BAS" | `{station: "BAS"}` | Basel/Binningen ✅ |
| Name "Davos" | `{station: "Davos"}` | DAV, elevation 1594m ✅ |
| Coordinates | `{coordinates: {lat: 47.38, lon: 8.57}}` | SMA, 0.4 km ✅ |
| Limit 1 | `{station: "Zurich", limit: 1}` | Exactly 1 row ✅ |
| Limit 365 | `{station: "Zurich", resolution: "daily", limit: 365}` | 98 rows (all available) ✅ |

#### Resolution tests (3/3 pass)

**Daily** (4 fields): `date`, `temperature_mean`, `temperature_max`, `temperature_min`
```json
{"date": "2026-04-07", "temperature_mean": 14.6, "temperature_max": 22.3, "temperature_min": 7.1}
```

**Monthly** (15 fields): + `precipitation`, `sunshine_duration_min`, `radiation_w_m2`, `wind_speed_m_s`, `pressure_hpa`, `frost_days`, `summer_days`, `heat_days`, `ice_days`, `tropical_nights`, `rain_days`
```json
{
  "date": "2026-01-01",
  "temperature_mean": 0.1, "temperature_max": 2.8, "temperature_min": -2.4,
  "precipitation": 39.3, "sunshine_duration_min": 4200, "radiation_w_m2": 45,
  "wind_speed_m_s": 1.7, "pressure_hpa": 943.7,
  "frost_days": 23, "summer_days": 0, "heat_days": 0,
  "ice_days": 6, "tropical_nights": 0, "rain_days": 6
}
```

**Yearly** (15 fields): same structure, annual aggregates
```json
{
  "date": "2025-01-01",
  "temperature_mean": 10.6, "precipitation": 1099.3,
  "frost_days": 58, "summer_days": 54, "heat_days": 14,
  "ice_days": 8, "tropical_nights": 4, "rain_days": 119
}
```

#### Date range tests (2/3 pass)

| Test | Input | Result |
|------|-------|--------|
| Monthly 2025 | `start_date: "2025-01-01", end_date: "2025-12-31"` | 12 rows ✅ |
| Yearly 2020-2025 | `start_date: "2020-01-01", end_date: "2025-12-31"` | 6 rows ✅ |
| Daily Jan 2025 | `start_date: "2025-01-01", end_date: "2025-01-31"` | **Empty** ❌ |

Daily data only covers ~3 months (Jan-Apr 2026). The description says "going back decades" — this is misleading for daily resolution.

#### Edge cases (2/4 pass)

| Test | Input | Result |
|------|-------|--------|
| Invalid "NOTASTATION" | `{station: "NOTASTATION"}` | **Chaumont (CHM)** ❌ Same resolver bug |
| Future date | `{station: "Zurich", start_date: "2030-01-01"}` | Empty data, no error ✅ |
| Malformed date | `{station: "Zurich", start_date: "not-a-date"}` | Empty data, **no validation error** ❌ |
| Both params | `{station: "BAS", coordinates: {...}}` | **Coordinates win** (SMA, not BAS) ⚠️ |

**Priority conflict**: In currentWeather, station parameter wins when both are provided. In climateData, coordinates win. Inconsistent behavior.

#### Station metadata includes `network` field
```json
{
  "name": "Zürich / Fluntern", "abbreviation": "SMA",
  "elevation": 556, "canton": "ZH", "network": "nbcn"
}
```

#### Variable field sets per station
Not all NBCN stations have the same instruments:
- Full stations (SMA, BAS, DAV): 15 fields
- Reduced stations (ELM, CHM): 8 fields (missing sunshine, radiation, wind, pressure, some indicators)

### 6. search — 8/14 PASS

| Test | Input | Result |
|------|-------|--------|
| German | `{query: "Klimawandel"}` | 437 results ✅ |
| English | `{query: "climate change", language: "en"}` | 125 results ✅ |
| French | `{query: "changement climatique", language: "fr"}` | 120 results ✅ |
| Italian | `{query: "cambiamento climatico", language: "it"}` | 106 results ✅ |
| Press releases | `{query: "Unwetter", contentType: "press-release"}` | 45 results, correct filter ✅ |
| Publications | `{query: "Klima", contentType: "publication"}` | 700 results ✅ |
| **pageSize: 3** | `{query: "Niederschlag", pageSize: 3}` | **10 results returned** ❌ |
| **pageSize: 1** | `{query: "Niederschlag", pageSize: 1}` | **10 results returned** ❌ |
| Sort date-desc | `{query: "Klimawandel", sort: "date-desc"}` | Same as relevance ⚠️ |
| Sort date-asc | `{query: "Klimawandel", sort: "date-asc"}` | Same as relevance ❌ |
| No results | `{query: "xyznonexistent123"}` | Empty ✅ |
| Pagination | `{query: "Klimawandel", page: 2}` | Different results ✅ |
| description/lead | Both fields identical | ❌ Token waste |
| contentType values | `"mchweb:pages/detail-page"` | ❌ Internal CMS names |

**pageSize bug confirmed**: Response metadata says `pageSize: 3` but array has 10 items. Upstream API limitation or server not truncating.

### 7. fetch — 5/6 PASS ✅

| Test | Input | Result |
|------|-------|--------|
| Markdown | Valid URL | Rich markdown with headings, links ✅ |
| Text | Same URL | Text extracted, **CSS icon names leak** ❌ |
| No metadata | `includeMetadata: false` | Metadata absent ✅ |
| Non-existent | Fake MeteoSwiss URL | Helpful error + search suggestion ✅ |
| Non-MeteoSwiss | google.com | Domain error ✅ |
| Invalid ID | `"not-a-url"` | Helpful error ✅ |

CSS icon leakage in text output: `chevron-left`, `chevron-right`, `arrow-up-right`, `favorite` appear as literal text. Also present in markdown format.

---

## WARNINGS (Non-blocking)

### W1: Timestamp format inconsistency (4 formats now)

| Tool | Format | Example |
|------|--------|---------|
| currentWeather (full) | Compact non-standard | `"202604081710"` |
| currentWeather (precip) | European DD.MM.YYYY | `"07.04.2026 23:50"` |
| localForecast | ISO 8601 ✅ | `"2026-04-08T04:00:35.659886Z"` |
| pollenData | European DD.MM.YYYY | `"07.04.2026 00:00"` |
| climateData | ISO date | `"2026-04-07"` |

### W2: "Zurich" resolves to airport (KLO) not city center (SMA)
Unchanged from PROD. Users saying "Zurich" likely mean the city.

### W3: 99 stations unreachable
With 299 total stations and max limit of 200, 99 stations can only be found via canton/search filters. No offset parameter.

### W4: No station type in stations list
No field to distinguish full weather (SMN) from precipitation-only (SMN-precip). The `network` field IS present in currentWeather and climateData responses, but NOT in the stations list.

### W5: Climate data description misleading
Says "going back decades" — true for monthly/yearly, but daily resolution only covers ~3 months.

### W6: Parameter priority inconsistency
When both `station` and `coordinates` are given:
- currentWeather: station wins
- climateData: coordinates win

---

## Verdict: NO-GO

### Must fix before release
1. **Location resolver** — Return errors for invalid/ambiguous inputs across all tools (currentWeather, localForecast, climateData). This is the same blocker as PROD v2.2.1.
2. **Postal code lookup** — Fix 1200→Geneva, 3000→Bern mappings.
3. **"Bern" station resolution** — New regression: resolves to Bernina instead of Bern.
4. **SIO visual observations** — Listed as OBS station but returns no visual data.

### Should fix before release
5. Normalize OBS field encoding (always include all boolean fields)
6. Validate date inputs in climateData (reject malformed strings)
7. Fix or remove pageSize parameter in search
8. Fix or document sort parameter limitations in search
9. Clarify daily climate data availability in tool description

### Nice-to-have
10. Add `station_type` / `network` field to stations list
11. Standardize timestamp formats to ISO 8601
12. Add pagination offset to stations
13. Remove description/lead duplication in search
14. Map contentType to user-facing names in search results
15. Strip CSS icon names from fetch text/markdown output

---

## Test Environment
- **Machine**: mac-zrh (Mac Mini M4 Pro)
- **MCP Config**: HTTP endpoint `https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp`
- **Tools registered**: 7 (stations, currentWeather, localForecast, pollenData, climateData, search, fetch)
- **Test time**: 2026-04-08 19:18-19:25 CEST
- **Weather during test**: ~22°C at SMA, sunny — data plausibility verified
