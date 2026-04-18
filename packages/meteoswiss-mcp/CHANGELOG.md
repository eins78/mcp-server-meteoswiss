# meteoswiss-mcp

## 2.3.0

### Patch Changes

- de9c937: Fix location resolver robustness across all MCP tools. Non-Swiss inputs, invalid station codes, and gibberish now return helpful errors instead of silently resolving to wrong Swiss locations.
  - **International city blocklist**: Reject well-known non-Swiss city names (Paris, London, Tokyo, etc.) before geocoding, preventing false-positive Swiss station matches (e.g. Paris → Payerne)
  - **Post-geocoding name guard**: Reject gibberish inputs (NOTASTATION, ABCDE) that the swisstopo API resolves to unrelated Swiss coordinates
  - **Non-Swiss error messages**: Return descriptive errors with examples and a pointer to `meteoswissStations` for invalid inputs, matching the `meteoswissPollenData` reference pattern
  - **Postal-code prefix fallback**: Round-number parent postal codes (1200 → Geneva, 3000 → Bern) now resolve correctly
  - **Geocoder origin restriction**: swisstopo queries restricted to `zipcode`, `gg25`, `district`, `kantone` origins to prevent non-Swiss city names from matching Swiss street labels
  - **Scored name matching**: Prevents "Bern" from resolving to Bernina; Swiss bounding box and distance threshold reject out-of-country inputs
  - **OBS visual observations**: Boolean fields (`has_rain`, `has_snowfall`, etc.) always return `true`/`false` instead of being stripped when MeteoSwiss reports "-" (not observed)
  - **`fetch` tool**: Revert unintentional breaking parameter rename — `id` reverted to `url`

## 2.2.0

### Minor Changes

- 615eb7a: Add Tier 1 OGD features: SMN-precip stations, climate data tool, visual observations.
  - **SMN-precip**: Merge ~248 precipitation-only stations into meteoswissCurrentWeather (per-station CSV fallback)
  - **meteoswissClimateData**: New tool for NBCN homogeneous climate series (29 climate + 46 precip stations, daily/monthly/yearly)
  - **Visual observations**: Enrich currentWeather with cloud cover, fog, rain, snowfall, hail, snow coverage for 8 OBS stations
  - **CSV parser**: Replace custom parser with csv-parse/sync library

### Patch Changes

- 32373ae: Fix fetch tool returning empty content bodies, pollen data empty results, and forecast stale-day entries.
  - **fetch:** Extract content from MeteoSwiss web component attributes (`<mch-text html="...">`) that JSDOM cannot render via shadow DOM
  - **fetch:** Clarify that `id` parameter must be a full URL from search results
  - **pollen:** Update data URL from `_d_now.csv` to `_d_recent.csv` after MeteoSwiss OGD rename
  - **forecast:** Filter out past dates before slicing to requested days count
  - **search:** Document upstream pagination overlap and date-asc sort behavior

## 2.1.0

### Minor Changes

- 0ba372a: Add weather icon SVG URLs to forecast responses. Each daily forecast now includes a `weather_icon_url` field linking to the official MeteoSwiss SVG pictogram. The skill documentation is updated with the URL pattern.
