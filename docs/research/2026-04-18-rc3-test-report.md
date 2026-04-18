# MeteoSwiss MCP Server v2.3.0-rc.3 — E2E Test Report

**Date:** 2026-04-18  
**Tester:** Claude Sonnet 4.6 (automated)  
**Endpoint:** https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp  
**Health check:** `{"status":"ok","version":"2.3.0-rc.3","sessions":0}`  
**Previous reports:** RC1 NO-GO (2026-04-08), RC2 NO-GO (2026-04-08)  
**Test method:** MCP Streamable HTTP, direct curl POST with session handshake

---

## VERDICT: ❌ NO-GO

**3 of 8 critical B2 blockers remain.** Postal code resolution (1200→Geneva, 3000→Bern) and invalid-input errors for `climateData` and `localForecast` are now fixed. But non-Swiss/invalid-input rejection in `currentWeather` and `localForecast` for "Paris" and `currentWeather` for "NOTASTATION" still silently return wrong Swiss station data. RC4 needs to fix these 3 remaining cases before promotion.

Additionally, the `fetch` tool's `url` parameter was renamed to `id` in rc.3 — a breaking schema change for existing clients.

---

## Blocker Status Table

| Blocker | RC1 | RC2 | RC3 | Detail |
|---------|-----|-----|-----|--------|
| B1 — Pollen French names | ✅ FIXED | ✅ STILL FIXED | ✅ STILL FIXED | English names throughout, 16 stations |
| B2 — Location resolver | ❌ BROKEN | ⚠️ PARTIAL | ⚠️ PARTIAL+ | 5/8 cases fixed; 3 remain (Paris×2, NOTASTATION) |
| B3 — OBS visual observations | ⚠️ PARTIAL | ⚠️ STILL PARTIAL | ⚠️ STILL PARTIAL | 7/8 stations; SIO upstream gap (not a code bug) |

---

## Test Summary

| Tool | Tests Run | Pass | Fail | Warn |
|------|-----------|------|------|------|
| meteoswissCurrentWeather | 18 | 13 | 3 | 2 |
| meteoswissLocalForecast | 12 | 9 | 1 | 2 |
| meteoswissPollenData | 5 | 5 | 0 | 1 |
| meteoswissClimateData | 8 | 8 | 0 | 2 |
| meteoswissStations | 5 | 5 | 0 | 1 |
| search | 5 | 5 | 0 | 1 |
| fetch | 3 | 3 | 0 | 1 |
| **TOTAL** | **56** | **48** | **4** | **10** |

---

## Critical B2 Cases — rc.3 Results

| # | Tool | Input | rc.2 (wrong) | rc.3 Expected | rc.3 Actual | Status |
|---|------|-------|-------------|--------------|-------------|--------|
| 1 | localForecast | `location="1200"` | Cousset (46.82°N) | Geneva area ~46.2°N | Genève (46.21°N) ✓ | ✅ PASS |
| 2 | localForecast | `location="3000"` | Treyvaux (46.73°N) | Bern area ~46.94°N | Bern (46.97°N) ✓ | ✅ PASS |
| 3 | localForecast | `location="99999"` | Bilten | Error: invalid code | `No forecast location found for "99999". Try a Swiss postal code (e.g., "8001")...` | ✅ PASS |
| 4 | currentWeather | `station="Paris"` | Grenchen (GRE) | Error: not Swiss | Payerne (PAY) — wrong station, no error | ❌ FAIL |
| 5 | localForecast | `location="Paris"` | Bettlach | Error | Prez-vers-Noréaz — wrong location, no error | ❌ FAIL |
| 6 | currentWeather | `station="NOTASTATION"` | Chasseral (CHA) | Error listing stations | Chasseral (CHA) — unchanged | ❌ FAIL |
| 7 | climateData | `station="INVALID_STATION_XYZ"` | Winterthur/Seen (WIN) | Error with examples | `No climate station found for "INVALID_STATION_XYZ". Is this a Swiss location? Examples: ALT, ANT, BAS, BER, CDF. Use meteoswissStations...` | ✅ PASS |
| 8 | localForecast | `location="ABCDE"` | Grüsch | Error | `No forecast location found for "ABCDE". Try a Swiss postal code...` | ✅ PASS |

### Root Cause Analysis for Remaining Failures

**Paris (B2-4, B2-5):** Switzerland has a hamlet named "Paris" in the municipality of Lucens, Canton Vaud — approximately 3 km from Payerne. The geocoder origin restriction (`place` preset = `zipcode,gg25,district,kantone`) correctly blocks international city results but still finds this legitimate Swiss hamlet. Score thresholding cannot distinguish the Swiss village from the French capital because the match IS a genuine Swiss place name. Fix needed: name blocklist for well-known international city names, or a minimum-population threshold (Paris, VD has ~100 inhabitants vs Paris, France ~2M).

**NOTASTATION (B2-6):** No Swiss station name contains "NOTASTATION" (exact + substring search both fail) and the geocoder with restricted origins should find nothing. Yet CHA (Chasseral) is returned — unchanged from rc.2. Root cause: likely a silent fallback in the SMN resolver that returns a candidate station when all lookup strategies produce empty results, rather than erroring. Fix needed: inspect `resolveSmnStation` fallback path and make it throw when the candidate set is empty.

---

## Regression Verification — rc.2 Passing → rc.3 Still Passing

All 14 tests that passed in rc.2 continue to pass in rc.3:

| Test | Expected | rc.3 Result | Status |
|------|----------|-------------|--------|
| currentWeather "Bern" | BER / Zollikofen | BER / Zollikofen, BE | ✅ |
| currentWeather "Davos" | DAV | DAV | ✅ |
| currentWeather "Lugano" | LUG | LUG | ✅ |
| currentWeather SMA | Zürich/Fluntern | SMA, 21.6°C | ✅ |
| currentWeather BER | Bern/Zollikofen | BER | ✅ |
| currentWeather coords (47.37, 8.54) | SMA + distance_km | SMA, distance_km: 2.1 ✅ |
| currentWeather "Bahnhofplatz 1 Bern" | BER | BER | ✅ |
| localForecast "8001" | Zürich | Zürich, type: postal_code | ✅ |
| localForecast "Zermatt" days=9 | 9 days, first=today | 9 days, 2026-04-18 | ✅ |
| localForecast "GVE" | Genève/Cointrin | Genève/Cointrin, type: station | ✅ |
| pollenData all stations | 16 stations, English names | 16 stations, English names | ✅ |
| pollenData "INVALID" | Error + list of 16 stations | Error + PBE, PBS, PBU… | ✅ |
| stations total | ~299 | 299, 20 returned | ✅ |
| search "Gewitter Zürich" | relevant DE results | 175 results, relevant | ✅ |

No regressions found.

---

## Tool-by-Tool Results

### 1. meteoswissCurrentWeather ❌ (13 pass / 3 fail / 2 warn of 18)

**Passing:**
- Abbreviations: SMA, BER, ALT, BAS, CHU, GSB, JUN, SAE — all return correct station data ✅
- Names: "Bern"→BER, "Davos"→DAV, "Lugano"→LUG ✅
- Coordinates (47.37°N, 8.54°E) → SMA, `distance_km: 2.1` (nested inside `station` object) ✅
- Address "Bahnhofplatz 1 Bern" → BER ✅

**Failing:**
- `station="Paris"` → Payerne (PAY, lat 46.81°N) — wrong station, no error ❌
- `station="NOTASTATION"` → Chasseral (CHA) — unchanged from rc.2, no error ❌
- SIO: no `visual_observations` block ❌ (B3 — upstream data gap, see §7)

**Warnings:**
- Timestamp format `202604181400` (YYYYMMDDHHmm) still non-ISO. Pre-existing.
- SAE `visual_observations` present but missing `cloud_cover_percent`. Upstream data gap.

**Sample response (BER):**
```json
{
  "station": { "name": "Bern / Zollikofen", "abbreviation": "BER",
    "elevation": 553, "coordinates": { "lat": 46.990744, "lon": 7.464061 },
    "municipality": "Zollikofen", "canton": "BE", "network": "smn",
    "distance_km": 2.1 },
  "timestamp": "202604181400",
  "measurements": {
    "temperature": { "value": 21.7, "unit": "°C" },
    "humidity": { "value": 62, "unit": "%" },
    ...
  }
}
```

---

### 2. meteoswissLocalForecast ⚠️ (9 pass / 1 fail / 2 warn of 12)

**Passing:**
- `"8001"` → Zürich (postal_code) ✅
- `"1200"` → Genève, lat 46.21°N ✅ **B2 FIXED**
- `"3000"` → Bern, lat 46.97°N ✅ **B2 FIXED**
- `"99999"` → error with helpful message ✅ **B2 FIXED**
- `"ABCDE"` → error with helpful message ✅ **B2 FIXED**
- `"Zermatt"` days=9 → 9 days, first date = 2026-04-18 (today) ✅
- `"GVE"` → Genève/Cointrin, type: station ✅
- Stale-day check: generated `2026-04-18T04:00:14Z`, first day 2026-04-18 ✅
- Field ordering: **FIXED** — both postal_code and station types now share identical key order `[date, precipitation, temperature, weather, weather_icon_url]` ✅

**Failing:**
- `"Paris"` → Prez-vers-Noréaz (lat 46.78°N) — wrong location, no error ❌

**Warnings:**
- `type: "postal_code"` returned even for place-name searches ("Zermatt"). Pre-existing.
- Error messages helpful but generic — don't mention the Swiss hamlet "Paris" disambiguation gap.

**Sample (1200 — fixed):**
```json
{
  "location": { "name": "Genève", "type": "postal_code",
    "elevation": 381, "coordinates": { "lat": 46.209839, "lon": 6.143739 } },
  "forecast": [{ "date": "2026-04-18", "temperature": { "min": 6.7, "max": 22.2, "unit": "°C" }, ... }]
}
```

---

### 3. meteoswissPollenData ✅ (5/5 pass / 0 fail / 1 warn)

All tests pass. B1 fully clean.

**Verified:**
- 16 stations returned in overview ✅
- English species names throughout: Alder (Alnus), Birch (Betula), Hazel (Corylus), Beech (Fagus), Ash (Fraxinus), Oak (Quercus), Grasses (Poaceae) ✅
- No French names (Aulne, Bouleau, Noisetier, etc.) ✅
- No d0/d1 duplicate entries ✅
- Invalid input error: ✅
  ```
  No pollen station found for "INVALID". Available: PBE (Bern), PBS (Basel),
  PBU (Buchs, SG), PCF (La Chaux-de-Fonds), PDS (Davos / Wolfgang),
  PGE (Genève), PJU (Jungfraujoch), PLO (Locarno / Monti), PLS (Lausanne),
  PLU (Lugano), PLZ (Luzern), PMU (Münsterlingen), PNE (Neuchâtel),
  PPY (Payerne), PSN (Sion), PZH (Zürich)
  ```

**Warning:** Timestamp format `"17.04.2026 00:00"` (EU locale DD.MM.YYYY HH:MM). Pre-existing inconsistency vs ISO 8601.

---

### 4. meteoswissClimateData ✅ (8/8 pass / 0 fail / 2 warn)

**Passing:**
- Daily SMA (last 30 days) — temperature fields only ✅
- Monthly BER (last 30 months) — 15-field rich records ✅
- Yearly JUN (last 30 years) ✅
- Coordinates → SMA with `distance_km: 2.1` ✅
- NBCN-precip station WIN (Winterthur/Seen) → only precipitation+rain_days ✅
- Date range: `BER monthly 2025-01-01 to 2025-12-31` → 12 records ✅
- `"INVALID_STATION_XYZ"` → error with examples ✅ **B2 FIXED**

**Warnings:**
- Daily resolution temperature-only (no precipitation, sunshine, wind) — undocumented. Pre-existing.
- Yearly resolution missing `precipitation` and `rain_days` vs monthly — undocumented. Pre-existing.

**B2-fixed error message:**
```
No climate station found for "INVALID_STATION_XYZ". Is this a Swiss location?
Examples: ALT (Altdorf), ANT (Andermatt), BAS (Basel / Binningen),
BER (Bern / Zollikofen), CDF (La Chaux-de-Fonds).
Use meteoswissStations to browse the ~75 long-term climate stations.
```

---

### 5. meteoswissStations ✅ (5/5 pass / 0 fail / 1 warn)

**Passing:**
- No filter: 299 total, 20 returned ✅
- Canton GR: 41 total ✅
- Search "Jung": JUN (Jungfraujoch) ✅
- Coordinates (47.37, 8.54): returns results ✅
- Limit parameter works ✅

**Warning:** `data_since` field still DD.MM.YYYY format. No station-type indicator (SMN/NBCN/precip-only). Pre-existing.

---

### 6. search ✅ (5/5 pass / 0 fail / 1 warn)

**Passing (all with correct `totalResults` field):**
- German "Gewitter Zürich": 175 results, relevant content ✅
- French "prévision météo Genève" (`language:"fr"`): 188 results ✅
- English "Swiss weather forecast" (`language:"en"`): 296 results ✅
- Publication filter (`contentType:"publication"`): 971 results ✅
- Garbage "xyzxyz123garbage": 0 results, graceful empty ✅

**Schema changes vs rc.2:**
- Response field renamed `total_results` → `totalResults` (camelCase)
- `contentType` enum now `["content","press-release","blog-article","publication"]` (was raw CMS type in response)
- New `page`/`pageSize` pagination fields in response
- New `sort` parameter (`relevance`, `date-desc`, `date-asc`)

**Warning:** `contentType` in individual result objects still raw CMS value (`"mchweb:pages/detail-page"`). Not LLM-friendly. Pre-existing.

---

### 7. fetch ✅ (3/3 pass / 0 fail / 1 warn)

**Passing:**
- Valid URL (from search results) → markdown content (4587 chars), title, metadata ✅
- Invalid URL → `"Fetch failed: Content not found: [URL]. Use the search tool to discover valid page URLs."` ✅
- `format:"markdown"` → proper structured content ✅

**Schema change vs rc.2 (BREAKING):**
- `url` parameter renamed to `id`. Existing clients using `url` will receive:
  ```
  MCP error -32602: Input validation error: path: ["id"], message: "Invalid input: expected string, received undefined"
  ```
  This is a **breaking change** for any integration already using the `fetch` tool.

**Improvements vs rc.2:**
- `keywords` now populated (was always `[]` in rc.2) ✅
- `contentType` in metadata simplified to `"website"` (was raw CMS type) ✅

---

## Not Fixed — Out-of-Scope Observations

These were flagged in rc.2 and remain unchanged in rc.3. None are code bugs:

| Issue | Status | Notes |
|-------|--------|-------|
| SIO visual_observations missing | ⚠️ Upstream | MeteoSwiss OGD data gap. Not a code bug. |
| SAE cloud_cover_percent missing | ⚠️ Upstream | Same. |
| JUN precipitation measurement missing | ⚠️ Upstream | Same. |
| Timestamp format inconsistency | ⚠️ UX debt | 4 different formats. Not addressed. Tracked in rc.2 UX review. |
| `type:"postal_code"` for place-name searches | ⚠️ UX debt | Not addressed. |
| Daily climateData temperature-only (undocumented) | ⚠️ UX debt | Not addressed. |
| `meteoswissStations` max limit < total count | ⚠️ UX debt | No pagination. Not addressed. |

---

## Improvements Introduced in rc.3 (Not in Scope but Observed)

These are positive changes beyond the B2 fix:

- **localForecast field ordering**: now consistent between `postal_code` and `station` response types (was inconsistent in rc.2) ✅
- **fetch `keywords`**: now populated with page keywords (was always `[]`) ✅
- **fetch `contentType` metadata**: simplified to `"website"` rather than raw CMS type ✅
- **search pagination**: new `page`/`pageSize` parameters and response fields ✅
- **search `sort` parameter**: new `relevance`/`date-desc`/`date-asc` sorting ✅

---

## Recommendation

**Hold for RC4.** 

Three blockers remain that allow LLMs to receive plausible-looking but wrong data with no error signal:

1. `currentWeather station="Paris"` → returns Payerne (PAY) — Swiss hamlet named "Paris" near Payerne fools the geocoder. Fix: blocklist well-known international city names, or add a population threshold to geocode matches.
2. `localForecast location="Paris"` → same root cause, returns Prez-vers-Noréaz.
3. `currentWeather station="NOTASTATION"` → returns Chasseral (CHA) — silent fallback when all resolver strategies fail. Fix: make the SMN resolver throw when its candidate set is empty.

Additionally, the `fetch` `url`→`id` parameter rename is a breaking schema change. Any published integration using the old `url` parameter will fail. If any MCP clients are already configured against this server (e.g., via `mcp-remote` on Claude Desktop), they may silently lose `fetch` functionality after upgrade.

**RC4 scope:**
1. Fix "Paris" case: name-based blocklist or population threshold in geocoder
2. Fix "NOTASTATION" case: remove silent fallback, make resolver fail-fast on empty candidate set
3. Consider deprecation notice for `url` → `id` rename (or document the breaking change in CHANGELOG)

After fixing items 1–2, the B2 blocker can be closed and v2.3.0 can be promoted to stable.
