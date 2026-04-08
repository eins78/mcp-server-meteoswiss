# MeteoSwiss MCP Server v2.3.0-rc.2 — UX Review

**Date:** 2026-04-08  
**Reviewer:** Claude Sonnet 4.6  
**Perspective:** LLM consumer (tool selection, parameter understanding, response parsing)

---

## Overall UX Rating: 6.5/10

The server has solid fundamentals — real data, good structure, units embedded inline, clean JSON. The pollen tool is a UX standout. The critical problem is the **silent failure model** across 4 of 7 tools: invalid inputs return plausible-looking data for random Swiss locations, giving LLMs no signal that anything went wrong. This is the most dangerous UX pattern possible for a data tool.

---

## 1. Tool Descriptions

### What Works Well
- `meteoswissCurrentWeather` — explicitly names the 8 OBS stations with visual observations. This is excellent: LLMs know exactly which stations to use for cloud cover queries.
- `meteoswissClimateData` — concrete use-case examples ("What are typical January temperatures?") are genuinely helpful for tool selection.
- `meteoswissPollenData` — simple, clear, mentions the ~15 station count.

### Issues

**`meteoswissLocalForecast` and `meteoswissCurrentWeather` accept the same location formats but one says "Postal codes, station abbreviations, place names" and the other says "name, abbreviation, address, or WGS84 coordinates."** An LLM trying to pick between them will notice they seem to serve different use cases, but the input format inconsistency is confusing:
- currentWeather: no postal code in description
- localForecast: no address/coordinates in description
- Both actually accept all formats

**`meteoswissStations` description says "~160 stations" but the actual count is 299.** An LLM querying for "all stations" might assume it got all 160 when it's getting the first 20 of 299.

**`meteoswissClimateData` doesn't warn that daily resolution is temperature-only** — a significant documentation gap. An LLM asking "what was the precipitation in Zurich on April 1st?" will get a daily record with no precipitation field and no explanation why.

**Missing tool differentiation:** There's no guidance on when to use `meteoswissCurrentWeather` vs `meteoswissClimateData` for recent historical data. Both can return "yesterday's temperature at SMA" — but only climateData can go back years, and only currentWeather has 10-minute granularity.

---

## 2. Parameter Descriptions

### What Works Well
- `meteoswissClimateData.resolution` — enum values are clear, and "daily (temp min/max/mean), monthly (full climate summary)" in the description gives context.
- `meteoswissStations.canton` — "e.g., ZH, BE, GR" with the 2-char constraint is clear.
- `meteoswissLocalForecast.days` — 1-9 with default 5 is immediately understandable.

### Issues

**`meteoswissCurrentWeather.station` says `"name (e.g., 'Zurich'), abbreviation (e.g., 'SMA'), or address (e.g., 'Bahnhofplatz 1 Bern')"` — but what about coordinates?** The tool accepts coordinates as a separate `coordinates` parameter, not in `station`, but an LLM might try `station="47.37, 8.54"` and get a wrong result.

**No parameter warns about Swiss-only coverage** — the `station` field in currentWeather and localForecast needs: "Must be a Swiss location. Non-Swiss place names will not work." This is the root cause of the Paris bug from an LLM's perspective.

**`meteoswissStations.limit` goes up to 200, but the total can be 299.** A limit of 200 cannot retrieve all stations. The description doesn't say how to paginate or whether pagination is even supported. It isn't — this is a gap.

**`meteoswissClimateData` has no required parameters.** Calling it with zero args will return data (whatever station is chosen by default), which is confusing behavior. The schema should require either `station` or `coordinates`.

**`meteoswissPollenData.station` accepts both pollen station abbreviations (PZH) and weather station abbreviations (ZUE)?** The description doesn't clarify — this would confuse an LLM that just got an abbreviation from `meteoswissStations`.

---

## 3. Response Format

### What Works Well
- **Units are embedded inline** in every measurement: `{"value": 14.7, "unit": "°C"}`. This is excellent — an LLM never needs to guess or remember units.
- **`source: "MeteoSwiss Open Data"`** on every response — good provenance.
- **`visual_observations` boolean flags** are semantically clear (`has_rain`, `has_fog`, `has_snow_coverage`) — much better than numeric codes.
- **Weather description strings** (`"partly sunny, thick passing clouds"`) alongside icon URLs — LLMs can use the string directly.
- **`distance_km`** when using coordinates — tells LLMs the nearest station may not be at the exact requested point.

### Issues

**Timestamp format is inconsistent across tools:**

| Tool | Timestamp Format | Example |
|------|-----------------|---------|
| currentWeather | YYYYMMDDHHmm | `"202604081910"` |
| localForecast | ISO 8601 with microseconds | `"2026-04-08T04:00:35.659886Z"` |
| pollenData | EU locale DD.MM.YYYY HH:MM | `"07.04.2026 00:00"` |
| climateData | ISO 8601 date | `"2026-04-08"` |
| stations | EU locale DD.MM.YYYY | `"01.01.1901"` |

The `currentWeather` timestamp (`202604081910`) cannot be parsed by standard ISO parsers without custom logic. An LLM that needs to compute "how old is this data?" must know this specific format.

**`meteoswissClimateData` monthly dates use the first of the month (`"2025-06-01"`) to represent June 2025.** This is a common convention but not documented — an LLM might confuse it with a single-day reading.

**Field ordering in `meteoswissLocalForecast` is inconsistent** between responses depending on the matched location type:
```json
// type: "postal_code" — temperature first:
{ "date": "...", "temperature": {...}, "precipitation": {...}, "weather": "...", "weather_icon_url": "..." }

// type: "station" — weather first:
{ "date": "...", "weather": "...", "weather_icon_url": "...", "temperature": {...}, "precipitation": {...} }
```
An LLM parsing positionally (rare but possible) or reading the structure would see different schemas.

**`meteoswissPollenData` wraps single-station responses in a `stations: [...]` array** — the same structure as the all-stations response. This is correct and consistent, but slightly odd: asking for "PZH pollen" returns `stations[0].pollen`. An LLM expecting a flat object for single-station queries would need to unwrap.

**`meteoswissStations` response lacks a `network` field** even though `meteoswissCurrentWeather` includes `"network": "smn"`. An LLM can't determine station type (full SMN vs precip-only vs NBCN climate) from the stations list alone.

**`search` contentType returns raw CMS strings** (`"mchweb:pages/detail-page"`, `"mchweb:pages/publication-page"`, `"mchweb:pages/home-page"`) rather than human-readable types. An LLM reasoning about content type (should I show this to a user as a news article vs a research publication?) has to parse CMS internals.

**`fetch` metadata `keywords: []` is always empty** — dead field consuming context.

---

## 4. Error Messages

### Excellent
```
pollenData: "No pollen station found for "INVALID". Available: PBE (Bern), PBS (Basel), ..."
```
This is the gold standard: explains what went wrong, lists what to use instead. Every tool with a station parameter should adopt this pattern.

```
fetch: "Content not found: [URL]. Use the search tool to discover valid page URLs."
```
Clear and actionable.

### Poor — Silent Resolution (Critical)
Four tools (`currentWeather`, `localForecast`, `climateData`, `search` n/a) silently return data for unrelated Swiss locations when given invalid inputs. There is no `error`, no `warning`, no `confidence` field, no indication that the input was not matched. Examples:

- `station="Paris"` → `{"station": {"name": "Grenchen", "abbreviation": "GRE"}}` ← **LLM has no idea this is wrong**
- `location="99999"` → `{"location": {"name": "Bilten"}}` ← **looks completely valid**
- `station="NOTASTATION"` → `{"station": {"name": "Chasseral"}}` ← **LLM will confidently report wrong weather**

**Why this matters for LLM consumers:** Unlike a human who might notice "wait, I asked for Paris but got Grenchen," an LLM will read the response, see a valid-looking station with real data, and report it as correct. This creates a **confident hallucination pipeline** where the tool actively enables wrong answers.

**Minimum fix:** Add `"matched_input": "Paris", "match_confidence": "low", "warning": "Input could not be resolved to a Swiss location"` or return an error.

### Missing Boundary Errors
- No error for out-of-bounds coordinates (e.g., lat=0, lon=0 would return a nearby Swiss station due to fallback)
- No error for future `end_date` in climateData
- No error for `start_date > end_date`

---

## 5. Consistency Across Tools

| Dimension | Rating | Issue |
|-----------|--------|-------|
| Location input format | ✅ Good | All data tools accept name/abbr/coords |
| Timestamp format | ❌ Poor | 4 different formats across 5 tools |
| Date format | ⚠️ Mixed | ISO in most, DD.MM.YYYY in stations/pollen |
| Unit embedding | ✅ Excellent | Inline units everywhere |
| Error behavior | ❌ Poor | Errors only in pollen+fetch; silent elsewhere |
| Station `network` field | ⚠️ Inconsistent | In currentWeather+climate, absent in stations |
| `distance_km` field | ⚠️ Inconsistent | In currentWeather+climate (coords), absent otherwise |
| `source` field | ✅ Excellent | Present on all responses |

---

## 6. Missing Features

**High priority for LLM use cases:**

1. **Location validation/suggestion:** When an input can't be resolved confidently, return a clarification response: `"Did you mean: BER (Bern/Zollikofen), BEH (Passo del Bernina)?"` instead of silently picking one.

2. **Forecast uncertainty:** `meteoswissLocalForecast` has no confidence or reliability indicator. Day 8-9 forecasts have much higher uncertainty than day 1-2, but both look identical in the response.

3. **Climate normals / anomaly context:** `meteoswissClimateData` returns raw values but no reference to what's "normal." A field like `"temperature_mean_anomaly_vs_1991_2020": +1.3` would be extremely useful.

4. **Pollen intensity level:** Raw particles/m³ values require specialized knowledge to interpret. A categorical field (`"level": "high"`) alongside the number would make pollen data immediately useful.

5. **Station capability discovery:** No way to know from `meteoswissStations` which parameters a station measures. An LLM might ask for wind data from a precip-only station and get nothing back.

6. **`meteoswissStations` pagination:** 299 stations but max limit is 200. No way to retrieve the full network.

---

## 7. Documentation Gaps (Promises vs Reality)

| Tool | Promise | Reality |
|------|---------|---------|
| currentWeather description | "Accepts ... addresses" | ✅ Works |
| currentWeather description | "~300 Swiss automatic stations" | ✅ (299 confirmed) |
| currentWeather description | "8 stations include visual observations" | ⚠️ SIO missing, SAE incomplete |
| localForecast description | "Postal codes: '8001', '3000', '1200'" | ❌ 3000→Treyvaux, 1200→Cousset |
| localForecast description | "~6000 Swiss locations" | ✅ Plausible |
| stations description | "~160 stations" | ❌ Actually 299 |
| climateData description | "daily (temp min/max/mean)" | ✅ But missing caveat: "precipitation NOT included in daily" |
| climateData description | "29 climate + 46 precipitation stations" | ✅ Confirmed nbcn-precip network |
| pollenData description | "~15 stations" | ✅ 16 confirmed |

---

## Priority Recommendations

### P0 — Release Blocker
1. Fix postal code resolver (1200→Geneva, 3000→Bern) — the fix exists for name resolution, apply same logic to postal codes
2. Reject non-Swiss inputs with clear error message
3. Reject clearly invalid inputs (NOTASTATION, 99999) with suggestions
4. Fix SIO visual_observations

### P1 — Next Sprint
5. Standardize timestamp to ISO 8601 across all tools (biggest consistency win)
6. Add `match_confidence` or `resolved_to` field when input is ambiguous
7. Add `network` field to `meteoswissStations` response
8. Document daily resolution is temperature-only in `meteoswissClimateData`
9. Fix field ordering consistency in `meteoswissLocalForecast` day objects

### P2 — Backlog
10. Add categorical pollen intensity levels
11. Add forecast uncertainty indicator for days 6-9
12. Remove empty `keywords: []` from fetch metadata
13. Normalize `contentType` in search to human-readable values
14. Add pagination to `meteoswissStations`
15. Add climate anomaly vs norm field to `meteoswissClimateData`
16. Fix SAE missing `cloud_cover_percent`, JUN missing `precipitation`
