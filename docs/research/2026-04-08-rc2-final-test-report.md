# MeteoSwiss MCP Server v2.3.0-rc.2 — E2E Test Report

**Date:** 2026-04-08  
**Tester:** Claude Sonnet 4.6 (automated)  
**Endpoint:** https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp  
**Previous report:** RC1 was NO-GO (2026-04-08)

---

## VERDICT: ❌ NO-GO

**Release blocker B2 (location resolver) is still broken for postal codes, non-Swiss inputs, and invalid abbreviations.** The fix was partial — it only addressed station name-to-abbreviation matching (e.g., "Bern" → BER). Postal code resolver, non-Swiss rejection, and invalid-input error handling remain broken across 4 tools.

---

## RC1 Blocker Status

| Blocker | RC1 Status | RC2 Status | Detail |
|---------|-----------|-----------|--------|
| B1 — Pollen French names | ✅ FIXED | ✅ STILL FIXED | English names throughout |
| B2 — Location resolver | ❌ BROKEN | ⚠️ PARTIALLY FIXED | Name resolution fixed; postal codes, non-Swiss, invalid inputs still broken |
| B3 — OBS visual obs fields | ⚠️ PARTIAL | ⚠️ STILL PARTIAL | 7/8 stations have visual_observations; SIO still missing |

---

## Test Summary

| Tool | Tests Run | Pass | Fail | Warn |
|------|-----------|------|------|------|
| meteoswissCurrentWeather | 18 | 14 | 3 | 1 |
| meteoswissLocalForecast | 12 | 4 | 6 | 2 |
| meteoswissPollenData | 5 | 5 | 0 | 1 |
| meteoswissClimateData | 8 | 5 | 1 | 2 |
| meteoswissStations | 5 | 5 | 0 | 2 |
| search | 5 | 5 | 0 | 2 |
| fetch | 3 | 3 | 0 | 1 |
| **TOTAL** | **56** | **41** | **10** | **11** |

---

## B2 — Location Resolver Detail

### What Was Fixed ✅
Station name → abbreviation matching now correctly prioritizes population centers:

```json
// Input: station="Bern"
{
  "station": { "name": "Bern / Zollikofen", "abbreviation": "BER", "canton": "BE" }
}
```

### What Is Still Broken ❌

**Postal code 1200 → Cousset (should be Geneva):**
```json
// meteoswissLocalForecast location="1200"
{
  "location": { "name": "Cousset", "type": "postal_code",
    "coordinates": { "lat": 46.817717, "lon": 6.978228 } }
}
// Expected: Chavannes-près-Renens or Geneva area (lat ~46.2)
```

**Postal code 3000 → Treyvaux (should be Bern):**
```json
// meteoswissLocalForecast location="3000"
{
  "location": { "name": "Treyvaux", "type": "postal_code",
    "coordinates": { "lat": 46.727456, "lon": 7.137458 } }
}
// Expected: Bern area (lat ~46.94)
```

**Non-Swiss city silently resolves to Swiss station:**
```json
// meteoswissCurrentWeather station="Paris"
{ "station": { "name": "Grenchen", "abbreviation": "GRE", "canton": "SO" } }
// Expected: error — "Paris is not in Switzerland"

// meteoswissLocalForecast location="Paris"
{ "location": { "name": "Bettlach", "type": "postal_code" } }
// Expected: error
```

**Invalid postal code silently resolves:**
```json
// meteoswissLocalForecast location="99999"
{ "location": { "name": "Bilten", "type": "postal_code" } }
// Expected: error — "99999 is not a valid Swiss postal code"
```

**Invalid abbreviation silently resolves:**
```json
// meteoswissCurrentWeather station="NOTASTATION"
{ "station": { "name": "Chasseral", "abbreviation": "CHA" } }

// meteoswissLocalForecast location="ABCDE"
{ "location": { "name": "Grüsch", "type": "postal_code" } }

// meteoswissClimateData station="INVALID_STATION_XYZ"
{ "station": { "name": "Winterthur / Seen", "abbreviation": "WIN" } }
```

**Scope of breakage:** currentWeather, localForecast, climateData all silently return wrong data. Only **pollenData correctly errors** on invalid input — it should serve as the reference implementation:
```
Error: "No pollen station found for "INVALID". Available: PBE (Bern), PBS (Basel), ..."
```

---

## B3 — OBS Visual Observations Detail

7 of 8 stations now have `visual_observations`. SIO (Sion) is still missing.

| Station | visual_observations | cloud_cover_percent | Notes |
|---------|--------------------|--------------------|-------|
| ALT | ✅ | ✅ | Complete |
| BAS | ✅ | ✅ | Complete |
| CHU | ✅ | ✅ | Complete |
| GSB | ✅ | ✅ | snow_coverage=true ✅ |
| JUN | ✅ | ✅ | Missing `precipitation` in measurements |
| SAE | ✅ | ❌ missing | cloud_cover_percent absent |
| SIO | ❌ missing | n/a | No visual_observations at all |
| SMA | ✅ | ✅ | Complete |

**JUN (Jungfraujoch) missing precipitation measurement:**
```json
// JUN measurements — precipitation field entirely absent
{
  "temperature": { "value": -2, "unit": "°C" },
  "wind_speed": { "value": 18.4, "unit": "km/h" },
  ...
  // no "precipitation" key
}
```

---

## Tool-by-Tool Results

### 1. meteoswissCurrentWeather ✅ (14/18 pass)

**Passing tests:**
- Station abbreviation (SMA, BER, ALT, BAS, CHU, GSB, JUN, SAE, SMA) ✅
- Station name ("Bern"→BER, "Davos"→DAV, "Lugano"→LUG) ✅ 
- Coordinates (lat=47.37, lon=8.54 → SMA, includes `distance_km: 2.1`) ✅
- Address ("Bahnhofplatz 1 Bern" → BER) ✅

**Failing tests:**
- SIO: no `visual_observations` ❌
- "Paris": returns Grenchen (GRE) silently ❌
- "NOTASTATION": returns Chasseral (CHA) silently ❌

**Warning:** Timestamp format `202604081910` (YYYYMMDDHHmm) is not ISO 8601. Coordinates response includes `distance_km` but station-name response does not — inconsistent.

**Sample response (BER):**
```json
{
  "station": { "name": "Bern / Zollikofen", "abbreviation": "BER",
    "elevation": 553, "coordinates": { "lat": 46.990744, "lon": 7.464061 },
    "municipality": "Zollikofen", "canton": "BE", "network": "smn" },
  "timestamp": "202604081910",
  "measurements": {
    "temperature": { "value": 14.7, "unit": "°C" },
    "humidity": { "value": 62, "unit": "%" },
    "precipitation": { "value": 0, "unit": "mm" },
    "wind_speed": { "value": 4, "unit": "km/h" },
    "pressure_sea_level": { "value": 1020.4, "unit": "hPa" }
  }
}
```

---

### 2. meteoswissLocalForecast ❌ (4/12 pass)

**Passing tests:**
- "8001" → Zürich ✅
- "Zermatt" days=9 → 9 days returned, today as day 1 ✅
- "GVE" station → Genève/Cointrin ✅
- Stale-day check: generated 04:00 UTC, first date = 2026-04-08 (today) ✅

**Failing tests:**
- "1200" → Cousset ❌ (should be Geneva area)
- "3000" → Treyvaux ❌ (should be Bern area)
- "Paris" → Bettlach ❌
- "99999" → Bilten ❌
- "ABCDE" → Grüsch ❌

**Warnings:** 
- Field ordering differs between postal_code and station type responses (postal_code: temperature first; station: weather first)
- `type: "postal_code"` returned even when searching by place name ("Zermatt")

**Sample: 1200 (broken):**
```json
{
  "location": { "name": "Cousset", "type": "postal_code",
    "elevation": 488, "coordinates": { "lat": 46.817717, "lon": 6.978228 } }
  // Should be: Chavannes-près-Renens, Genève area (lat ~46.5)
}
```

---

### 3. meteoswissPollenData ✅ (5/5 pass)

All tests pass. English species names confirmed throughout. No French names. No d0/d1 duplicates. 16 stations returned in overview.

**Species names verified:** Alder (Alnus), Birch (Betula), Hazel (Corylus), Beech (Fagus), Ash (Fraxinus), Oak (Quercus), Grasses (Poaceae) — all English ✅

**Error handling is excellent:**
```
Error: "No pollen station found for "INVALID". Available: PBE (Bern), PBS (Basel), 
PBU (Buchs, SG), PCF (La Chaux-de-Fonds), PDS (Davos / Wolfgang), PGE (Genève), 
PJU (Jungfraujoch), PLO (Locarno / Monti), PLS (Lausanne), PLU (Lugano), 
PLZ (Luzern), PMU (Münsterlingen), PNE (Neuchâtel), PPY (Payerne), PSN (Sion), PZH (Zürich)"
```

**Warning:** Timestamp format `"07.04.2026 00:00"` (EU locale format) is inconsistent with ISO 8601 used in other tools.

---

### 4. meteoswissClimateData ✅/❌ (5/8)

**Passing tests:**
- Daily SMA (last 30 days) ✅
- Monthly BER (15 months) ✅ — rich 13-field records
- Yearly JUN (2020-2025) ✅
- Coordinates → SMA (includes `distance_km`) ✅
- NBCN-precip station (Winterthur/Seen) returns only precipitation+rain_days ✅

**Failing tests:**
- Invalid station ("INVALID_STATION_XYZ") → returns Winterthur/Seen silently ❌

**Warnings:**
- Daily resolution returns only temperature fields (no precipitation, sunshine, wind) — not documented anywhere
- Yearly resolution missing `precipitation` and `rain_days` vs monthly — not documented

**Monthly record (BER) — most complete:**
```json
{
  "date": "2025-06-01",
  "temperature_mean": 20.4, "temperature_max": 26.7, "temperature_min": 13.8,
  "precipitation": 53.4, "sunshine_duration_min": 17315, "radiation_w_m2": 294,
  "wind_speed_m_s": 2, "pressure_hpa": 955.4,
  "frost_days": 0, "summer_days": 21, "heat_days": 7,
  "ice_days": 0, "tropical_nights": 0, "rain_days": 6
}
```

**Daily record (SMA) — temperature-only, no documentation warning:**
```json
{
  "date": "2026-04-07",
  "temperature_mean": 14.6,
  "temperature_max": 22.3,
  "temperature_min": 7.1
  // No precipitation, sunshine, wind, etc.
}
```

---

### 5. meteoswissStations ✅ (5/5 pass)

All tests pass. 299 total stations in network (larger than the ~160 "automatic weather stations" documented — includes historical/precip-only stations).

**No filter:** 299 total, 20 shown ✅  
**Canton filter (GR):** 41 stations ✅  
**Search ("Jung"):** 1 result (JUN) ✅

**Warnings:**
- `data_since` format `"01.01.1901"` (DD.MM.YYYY) — inconsistent with ISO 8601
- No station type indicator (full SMN vs precipitation-only vs historical)
- No `network` field (available in currentWeather response but not here)

---

### 6. search ✅ (5/5 pass)

All language and content type tests pass.

- German "Gewitter Zürich" → 175 results, relevant ✅
- French "prévision météo Genève" → 188 results, correct `meteosuisse.admin.ch` domain ✅
- English "Swiss weather forecast" → 296 results, correct `meteoswiss.admin.ch` domain ✅
- Publication filter → 420 climate publications ✅
- Garbage "xyzxyz123garbage" → 0 results, graceful empty response ✅

**Warnings:**
- `contentType` returns raw CMS type (`"mchweb:pages/detail-page"`) — not LLM-friendly
- `publicationDate` field is inconsistently present (only on some result types)
- Some descriptions contain embedded `\n` characters (HTML artifact from source)

---

### 7. fetch ✅ (3/3 pass)

- Valid URL → clean markdown with metadata ✅  
- Invalid URL → `"Content not found: [URL]. Use the search tool to discover valid page URLs."` ✅
- `format: "markdown"` → proper markdown with headings and links ✅

**Warning:** `keywords: []` always empty — useless field, should be removed.

---

## Regressions vs RC1

None identified. The failing tests were already failing in RC1 (same inputs, same wrong outputs).

---

## Must-Fix Before Release

1. **[BLOCKER]** Postal code resolver: "1200" must → Geneva, "3000" must → Bern. The fix exists for name resolution (Bern→BER) — apply same logic to postal code resolution (rank by population/importance, not alphabetical).
2. **[BLOCKER]** Non-Swiss inputs must error with message "X is not a Swiss location. This tool only covers Switzerland."
3. **[BLOCKER]** Invalid inputs must error with suggestions, not silently return random stations. See pollenData as reference implementation.
4. **[HIGH]** SIO (Sion) still missing `visual_observations` despite being one of the 8 documented OBS stations.
5. **[MEDIUM]** SAE missing `cloud_cover_percent` in `visual_observations`.
6. **[MEDIUM]** JUN missing `precipitation` measurement.

---

## Suggested for Next RC

- Standardize timestamp format to ISO 8601 across all tools (currently mixed: `202604081910`, `"07.04.2026 00:00"`, `"01.01.1901"`, `"2026-04-08T04:00:35Z"`)
- Document resolution-dependent field differences in `meteoswissClimateData`
- Add station type field to `meteoswissStations` (smn / smn-precip / nbcn / historical)
- Remove empty `keywords: []` from fetch metadata
- Normalize `contentType` in search results to human-readable values
