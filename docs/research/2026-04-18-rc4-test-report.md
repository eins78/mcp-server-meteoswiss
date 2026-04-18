# MeteoSwiss MCP Server v2.3.0-rc.4 — E2E Test Report

**Date:** 2026-04-18  
**Tester:** Claude Sonnet 4.6 (automated)  
**Endpoint:** https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp  
**Health check:** `{"status":"ok","version":"2.3.0-rc.4","sessions":0}`  
**Previous reports:** RC1 NO-GO (2026-04-08), RC2 NO-GO (2026-04-08), RC3 NO-GO (2026-04-18)  
**Test method:** MCP Streamable HTTP, direct curl POST with session handshake

---

## VERDICT: ✅ GO

**All 3 remaining B2 blockers are fixed. No regressions. `fetch` schema revert confirmed.**

The 3 rc.3 failures (Paris×2 and NOTASTATION) now produce clear, helpful error messages. The `fetch` parameter is back to `url`. The 14 rc.2-passing regressions and all 5 rc.3 B2 fixes continue to hold. The only remaining open item is B3 (SIO visual observations) — an upstream data gap, not a code bug, pre-existing since rc.1.

Recommendation: **promote to v2.3.0 stable + deploy to PROD.**

---

## Blocker Status Table

| Blocker | RC1 | RC2 | RC3 | RC4 | Detail |
|---------|-----|-----|-----|-----|--------|
| B1 — Pollen French names | ✅ FIXED | ✅ STILL FIXED | ✅ STILL FIXED | ✅ STILL FIXED | English names throughout, 16 stations |
| B2 — Location resolver | ❌ BROKEN | ⚠️ PARTIAL | ⚠️ PARTIAL+ | ✅ FIXED | All 8 cases now pass; Paris×2 + NOTASTATION resolved |
| B3 — OBS visual observations | ⚠️ PARTIAL | ⚠️ STILL PARTIAL | ⚠️ STILL PARTIAL | ⚠️ STILL PARTIAL | 7/8 stations; SIO upstream gap (not a code bug) |

---

## Test Summary

| Tool | Tests Run | Pass | Fail | Warn |
|------|-----------|------|------|------|
| meteoswissCurrentWeather | 18 | 15 | 0 | 3 |
| meteoswissLocalForecast | 12 | 10 | 0 | 2 |
| meteoswissPollenData | 5 | 5 | 0 | 1 |
| meteoswissClimateData | 8 | 8 | 0 | 2 |
| meteoswissStations | 5 | 5 | 0 | 1 |
| search | 5 | 5 | 0 | 1 |
| fetch | 4 | 4 | 0 | 0 |
| **TOTAL (base 56 + 1 new)** | **57** | **52** | **0** | **10** |

*Warnings are pre-existing UX observations (timestamp format, etc.) — none are blockers.*

---

## Critical rc.3 → rc.4 Cases

### B2 Blockers

| # | Tool | Input | rc.3 (wrong) | rc.4 Expected | rc.4 Actual | Status |
|---|------|-------|-------------|--------------|-------------|--------|
| C1 | `meteoswissCurrentWeather` | `station="Paris"` | Payerne (PAY) | Error: international city blocked | `"Paris" is a well-known international city name, not a Swiss weather station. Use a specific Swiss location instead…` | ✅ PASS |
| C2 | `meteoswissLocalForecast` | `location="Paris"` | Prez-vers-Noréaz | Error: international city blocked | `"Paris" is a well-known international city name, not a Swiss location. Use a specific Swiss location instead…` | ✅ PASS |
| C3 | `meteoswissCurrentWeather` | `station="NOTASTATION"` | Chasseral (CHA) | Error: no match + suggestions | `No weather station found for "NOTASTATION". Is this a Swiss location? Examples: ABO (Adelboden), AEG…` | ✅ PASS |

### fetch Schema Revert

| Test | rc.3 Behavior | rc.4 Expected | rc.4 Actual | Status |
|------|--------------|--------------|-------------|--------|
| `fetch {url: "..."}` | Validation error (expected `id`) | Accepted, returns content | Works — returned 4587 chars of Gewitter page | ✅ PASS |
| `fetch {id: "..."}` | Worked (rc.3 schema) | Rejected — `id` no longer valid | `Invalid input: expected string, received undefined` at path `["url"]` | ✅ PASS |

**Note:** `id` parameter is now fully removed — no alias. Clients using rc.3's `id` parameter need to switch back to `url`. This is a deliberate revert, not a regression.

---

## International City Blocklist Coverage (rc.4-specific)

All tested entries correctly blocked:

| Tool | Input | Result | Status |
|------|-------|--------|--------|
| `currentWeather` | `station="Berlin"` | Error: international city blocked | ✅ |
| `currentWeather` | `station="London"` | Error: international city blocked | ✅ |
| `currentWeather` | `station="Tokyo"` | Error: international city blocked | ✅ |
| `currentWeather` | `station="New York"` | Error: international city blocked | ✅ |
| `currentWeather` | `station="Rome"` | Error: international city blocked | ✅ |
| `currentWeather` | `station="Madrid"` | Error: international city blocked | ✅ |
| `currentWeather` | `station="Beijing"` | Error: international city blocked | ✅ |
| `localForecast` | `location="London"` | Error: international city blocked | ✅ |
| `localForecast` | `location="Berlin"` | Error: international city blocked | ✅ |
| `localForecast` | `location="Tokyo"` | Error: international city blocked | ✅ |
| `currentWeather` | `station="NYC"` | Error: no station found (name-match path, not blocklist — still correct) | ✅ |

**Observation:** `"NYC"` is not in the blocklist but still fails correctly via the name-match guard (no Swiss station match). The error message is slightly different (`"No weather station found…"` vs `"…well-known international city name…"`) but functionally correct.

---

## geocodedNameMatchesQuery Guard

| Input | rc.3 | rc.4 Expected | rc.4 Actual | Status |
|-------|------|--------------|-------------|--------|
| `currentWeather station="ZZZZZZ"` | — | Error: no match | `No weather station found for "ZZZZZZ"…` | ✅ |
| `currentWeather station="1234567890"` | — | Error: no match | `No weather station found for "1234567890"…` | ✅ |
| `localForecast location="ABCDE"` | ✅ PASS | Still error (regression check) | `No forecast location found for "ABCDE"…` | ✅ |

---

## Regression Verification — rc.3 Passing → rc.4 Still Passing

All 14 rc.2-passing tests and 5 rc.3 B2 fixes continue to pass:

| Test | Expected | rc.4 Result | Status |
|------|----------|-------------|--------|
| `currentWeather "Bern"` | BER / Zollikofen | BER / Zollikofen, BE | ✅ |
| `currentWeather "Davos"` | DAV | DAV | ✅ |
| `currentWeather "Lugano"` | LUG | LUG | ✅ |
| `currentWeather coords (47.37, 8.54)` | SMA + distance_km | SMA, distance_km: 2.1 | ✅ |
| `currentWeather "Bahnhofplatz 1 Bern"` | BER | BER | ✅ |
| `localForecast "8001"` | Zürich (postal_code) | Zürich, lat 47.37°N | ✅ |
| `localForecast "1200"` | Genève (~46.21°N) | Genève, lat 46.21°N | ✅ |
| `localForecast "3000"` | Bern area (~46.97°N) | Bern, lat 46.97°N | ✅ |
| `localForecast "99999"` | Error with help text | Error: No forecast location found… | ✅ |
| `localForecast "Zermatt" days=9` | 9 days, first=today | 9 days, 2026-04-18 to 2026-04-26 | ✅ |
| `localForecast "GVE"` | Genève/Cointrin (station) | Genève / Cointrin, type: station | ✅ |
| `pollenData` (all) | 16 stations, English names | 16 stations, English only | ✅ |
| `pollenData "INVALID"` | Error + 16 station list | Error + PBE, PBS, PBU… | ✅ |
| `stations` (no filter) | ~299 total, 20 returned | 299 total, 20 returned | ✅ |
| `search "Gewitter Zürich"` | DE results | 175 results | ✅ |
| `climateData "INVALID_STATION_XYZ"` | Error with examples | Error: No climate station found… | ✅ |
| `localForecast "ABCDE"` | Error | Error: No forecast location found… | ✅ |

No regressions found.

---

## Tool-by-Tool Results

### 1. meteoswissCurrentWeather ✅ (15 pass / 0 fail / 3 warn of 18)

**Passing:**
- Abbreviations: SMA, BER, ALT, BAS, CHU, GSB, JUN, SAE — all return correct station data ✅
- Names: "Bern"→BER, "Davos"→DAV, "Lugano"→LUG ✅
- Coordinates (47.37°N, 8.54°E) → SMA, `distance_km: 2.1` ✅
- Address "Bahnhofplatz 1 Bern" → BER ✅
- `station="Paris"` → error (blocklist) ✅ **B2 FIXED**
- `station="NOTASTATION"` → error with examples ✅ **B2 FIXED**

**Warnings (pre-existing):**
- Timestamp format `202604181530` (YYYYMMDDHHmm) still non-ISO
- SIO: no `visual_observations` block (B3 upstream gap)
- SAE: `visual_observations` present but `cloud_cover_percent` absent (upstream gap)

**Sample response (BER):**
```json
{
  "station": { "name": "Bern / Zollikofen", "abbreviation": "BER",
    "elevation": 553, "coordinates": { "lat": 46.990744, "lon": 7.464061 },
    "municipality": "Zollikofen", "canton": "BE", "network": "smn" },
  "timestamp": "202604181530",
  "measurements": {
    "temperature": { "value": 21.6, "unit": "°C" },
    "humidity": { "value": 36.7, "unit": "%" },
    "dew_point": { "value": 6.2, "unit": "°C" },
    "precipitation": { "value": 0, "unit": "mm" },
    "wind_speed": { "value": 4.3, "unit": "km/h" },
    "wind_gust": { "value": 13, "unit": "km/h" },
    "wind_direction": { "value": 256, "unit": "°" },
    "sunshine": { "value": 9, "unit": "min" },
    "radiation": { "value": 502, "unit": "W/m²" },
    "pressure_station": { "value": 953.9, "unit": "hPa" },
    "pressure_sea_level": { "value": 1016.4, "unit": "hPa" }
  },
  "source": "MeteoSwiss Open Data"
}
```

---

### 2. meteoswissLocalForecast ✅ (10 pass / 0 fail / 2 warn of 12)

**Passing:**
- `"8001"` → Zürich (postal_code, lat 47.37°N) ✅
- `"1200"` → Genève (lat 46.21°N) ✅
- `"3000"` → Bern (lat 46.97°N) ✅
- `"99999"` → error with helpful message ✅
- `"ABCDE"` → error with helpful message ✅
- `"Zermatt"` days=9 → 9 days, first date 2026-04-18 ✅
- `"GVE"` → Genève/Cointrin, type: station ✅
- `"Paris"` → error (blocklist) ✅ **B2 FIXED**

**Warnings (pre-existing):**
- `type: "postal_code"` returned for place-name searches ("Zermatt")
- Error messages don't mention the Swiss hamlet disambiguation gap

**Sample response (8001):**
```json
{
  "location": { "name": "Zürich", "type": "postal_code",
    "elevation": 409, "coordinates": { "lat": 47.372289, "lon": 8.542189 } },
  "forecast": [
    { "date": "2026-04-18", "temperature": { "min": 9, "max": 22.7, "unit": "°C" },
      "precipitation": { "total": 0, "unit": "mm" },
      "weather": "sunny",
      "weather_icon_url": "https://www.meteoschweiz.admin.ch/static/resources/weather-symbols/1.svg" },
    { "date": "2026-04-19", "temperature": { "min": 9.6, "max": 18.5, "unit": "°C" },
      "precipitation": { "total": 0, "unit": "mm" },
      "weather": "partly sunny, thick passing clouds", ... }
  ]
}
```

---

### 3. meteoswissPollenData ✅ (5/5 pass / 0 fail / 1 warn)

B1 fully clean. All 7 English species names verified: Alder, Birch, Hazel, Beech, Ash, Oak, Grasses. No French names (Aulne, Bouleau, etc.). 16 stations. No d0/d1 duplicates.

**Warning:** Timestamp format `"17.04.2026 00:00"` (EU locale). Pre-existing.

---

### 4. meteoswissClimateData ✅ (8/8 pass / 0 fail / 2 warn)

- Daily SMA (30 days) — temperature fields only ✅
- Monthly BER (30 months) — rich multi-field records ✅
- `"INVALID_STATION_XYZ"` → error with examples ✅

**Warnings (pre-existing):**
- Daily resolution temperature-only (undocumented)
- Yearly resolution missing some fields vs monthly (undocumented)

---

### 5. meteoswissStations ✅ (5/5 pass / 0 fail / 1 warn)

- No filter: 299 total, 20 returned ✅
- Canton GR: 41 total ✅
- Search "Jung": JUN (Jungfraujoch) ✅

**Warning:** `data_since` still DD.MM.YYYY format. Pre-existing.

---

### 6. search ✅ (5/5 pass / 0 fail / 1 warn)

- DE "Gewitter Zürich": 175 results ✅
- FR "prévision météo Genève": 188 results ✅
- Garbage: 0 results ✅

**Warning:** `contentType` in individual results still raw CMS value. Pre-existing.

---

### 7. fetch ✅ (4/4 pass / 0 fail / 0 warn)

- Valid URL with `url` param → 4587 chars markdown content, metadata ✅ **rc.3 revert confirmed**
- Invalid URL → `"Fetch failed: Content not found…"` ✅
- `id` param → validation error (correctly rejected) ✅

---

## B3 Visual Observations Status

| Station | rc.3 | rc.4 | Notes |
|---------|------|------|-------|
| ALT | ✅ has visual_obs | ✅ has visual_obs | |
| BAS | ✅ has visual_obs | ✅ has visual_obs | |
| CHU | ✅ has visual_obs | ✅ has visual_obs | |
| GSB | ✅ has visual_obs | ✅ has visual_obs | |
| JUN | ✅ has visual_obs | ✅ has visual_obs | |
| SAE | ✅ has visual_obs | ✅ has visual_obs | `cloud_cover_percent` still absent (upstream) |
| SMA | ✅ has visual_obs | ✅ has visual_obs | |
| SIO | ❌ missing | ❌ missing | Upstream data gap, not a code bug |

---

## Not-Fixed — Out-of-Scope Observations

These remain unchanged from rc.3. None are code bugs or release blockers:

| Issue | Status | Notes |
|-------|--------|-------|
| SIO visual_observations missing | ⚠️ Upstream | MeteoSwiss OGD data gap. Not a code bug. |
| SAE cloud_cover_percent missing | ⚠️ Upstream | Same. |
| Timestamp format inconsistency | ⚠️ UX debt | 3 formats: `202604181530`, `"17.04.2026 00:00"`, `"01.01.1901"`. Pre-existing. |
| `type: "postal_code"` for place-name searches | ⚠️ UX debt | Pre-existing. |
| Daily climateData temperature-only (undocumented) | ⚠️ UX debt | Pre-existing. |
| `meteoswissStations` max limit < total count | ⚠️ UX debt | No pagination. Pre-existing. |
| `contentType` in search results raw CMS value | ⚠️ UX debt | Pre-existing. |

---

## Recommendation

**✅ GO — Promote to v2.3.0 stable and deploy to PROD.**

All 3 B2 blockers are resolved:
- Paris/international city names: blocked by 32-entry `INTERNATIONAL_CITY_BLOCKLIST` applied before geocoding
- NOTASTATION / nonsense inputs: rejected by post-geocoding `geocodedNameMatchesQuery` name-match guard
- `fetch` schema: `url` parameter correctly restored; `id` correctly rejected

The `url` revert means any client using rc.3's `id` parameter will break — this is expected and documented. Since rc.3 was never promoted to PROD, this affects TEST integrations only.

B3 (SIO visual observations) is a MeteoSwiss upstream data gap, not actionable in code. It should be noted in release notes but does not block stable promotion.

**RC4 scope closure:** B1 ✅, B2 ✅, B3 ⚠️ (upstream, tracked). Recommend creating a v2.3.0 release from `main` and deploying to PROD.
