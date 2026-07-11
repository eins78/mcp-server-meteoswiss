# meteoswiss-mcp

## 2.3.2

### Patch Changes

- 7eb1e59: Restore ChatGPT Deep Research / Connectors compatibility for the `fetch` tool. The v2.3.1 release renamed the `fetch` argument from `id` to `url`, which broke the canonical contract that ChatGPT (and the OpenAI Responses API Deep Research models) expects. This release renames it back to `id`, adds the canonical `text` and top-level `url` fields to the `fetch` response, keeps `content` as a back-compat alias of `text`, and adds an integration test suite + tool-manifest snapshot to prevent the regression from recurring. See `docs/plans/2026-04-19-chatgpt-fetch-compat.md` for the full investigation and references.

## 2.3.1

### Patch Changes

- fa7ab7b: Expose `meteoswiss_mcp_build_info{version, node_version}` Prometheus gauge for version observability. Enables the Grafana dashboard to show the deployed version of each environment (TEST and PROD) at a glance without querying MCP endpoints.

## 2.3.0

### Minor Changes

- 615eb7a: Add Tier 1 OGD features: SMN-precip stations, climate data tool, visual observations.
  - **SMN-precip**: Merge ~248 precipitation-only stations into meteoswissCurrentWeather (per-station CSV fallback)
  - **meteoswissClimateData**: New tool for NBCN homogeneous climate series (29 climate + 46 precip stations, daily/monthly/yearly)
  - **Visual observations**: Enrich currentWeather with cloud cover, fog, rain, snowfall, hail, snow coverage for 8 OBS stations
  - **CSV parser**: Replace custom parser with csv-parse/sync library

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

## 2.2.1

### Patch Changes

- 32373ae: Fix fetch tool returning empty content bodies, pollen data empty results, and forecast stale-day entries.
  - **fetch:** Extract content from MeteoSwiss web component attributes (`<mch-text html="...">`) that JSDOM cannot render via shadow DOM
  - **fetch:** Clarify that `id` parameter must be a full URL from search results
  - **pollen:** Update data URL from `_d_now.csv` to `_d_recent.csv` after MeteoSwiss OGD rename
  - **forecast:** Filter out past dates before slicing to requested days count
  - **search:** Document upstream pagination overlap and date-asc sort behavior

## 2.2.0

### Minor Changes

- ff0cf3b: Add opt-in Prometheus metrics via `prom-client` (#58). Set `METRICS_ENABLED=true` to expose a standard `/metrics` endpoint; when unset or `false` (default), `/metrics` returns 404 and all recording functions are no-ops.
  - **Metrics exposed**: `mcp_tool_calls_total{tool_name}` (counter), `mcp_tool_call_duration_seconds{tool_name}` (latency histogram), `mcp_active_sessions` (gauge), `mcp_requests_total{method}` (HTTP request counter), and `nodejs_*` runtime metrics (memory, GC, event loop)
  - **Privacy**: No user data is collected — only tool names, HTTP methods, and session counts

## 2.1.0

### Minor Changes

- 0ba372a: Add weather icon SVG URLs to forecast responses. Each daily forecast now includes a `weather_icon_url` field linking to the official MeteoSwiss SVG pictogram. The skill documentation is updated with the URL pattern.

## 2.0.2

### Patch Changes

- a976037: Add MCP Registry metadata (`mcpName` + `server.json`) and register with the official MCP Registry.

## 2.0.1

### Patch Changes

- 63f6f7f: Add an automated GitHub Actions release pipeline (#50). Publishes to npm via Trusted Publishers (OIDC, no tokens) and builds multi-platform Docker images (amd64 + arm64) to GHCR. Also fixes the published npm package size (65 kB, previously 81 MB) and adapts the Docker build and release workflow to the monorepo layout.

## 2.0.0

### Major Changes

- d6b1c62: Complete rewrite on MeteoSwiss Open Government Data (OGD) — the same data powering the MeteoSwiss app and website (#43).
  - **Monorepo restructure** under `meteoswiss-llm-tools`, ready for future packages
  - **New tools**: `meteoswissLocalForecast` (multi-day forecasts for ~6000 Swiss locations by postal code, station, or place name), `meteoswissCurrentWeather` (real-time measurements from ~160 automatic weather stations), `meteoswissStations` (station discovery and search), `meteoswissPollenData` (pollen data from ~15 monitoring stations), plus `search` and `fetch` for MeteoSwiss website content
  - **Removed** the region-based `meteoswissWeatherReport` tool
  - **Transport**: Migrate from SSE to MCP Streamable HTTP (SDK 1.28+)
  - **Dependencies**: Upgrade to Zod 4

## 1.0.0

### Major Changes

- 74b8c37: First stable release — MCP server for MeteoSwiss weather data.
  - **`meteoswissWeatherReport`** tool: weather reports for Swiss regions (north / south / west)
  - Multi-language support (DE, EN, FR, IT)
  - HTTP/SSE transport with `mcp-remote` integration
  - Docker support and a homepage with installation instructions
