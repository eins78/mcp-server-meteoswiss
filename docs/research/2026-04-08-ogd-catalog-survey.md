# MeteoSwiss OGD Catalog Survey

> Complete inventory of all MeteoSwiss Open Government Data collections on
> data.geo.admin.ch, with coverage mapping, implementation feasibility,
> and prioritized recommendations for MCP server expansion.

- **Date:** 2026-04-08
- **Status:** Research
- **Scope:** All `ch.meteoschweiz.*` collections on the STAC API + OGD documentation
- **Source:** [OGD docs](https://opendatadocs.meteoswiss.ch/), [STAC API](https://data.geo.admin.ch/api/stac/v1/collections)

## Executive Summary

MeteoSwiss publishes **17 OGD collections** (CC-BY licensed) via the STAC API, plus **11 legacy collections** under proprietary license. Of the 17 OGD collections:

- **3 are already exposed** as MCP tools (current weather, forecasts, pollen)
- **12 use CSV format** and can reuse our existing CSV parser + STAC client
- **5 use binary formats** (HDF5, GRIB2, NetCDF) requiring new dependencies
- **~10 more collections** are expected in 2026 (radio soundings, radar products, spatial climate)

The server currently covers the highest-value datasets. The remaining CSV collections offer incremental value at low implementation cost. Binary-format collections (radar, NWP grids) are high-value but impractical for LLM text responses.

**Recommended next additions:** precipitation stations (merge into current weather), climate homogeneous series (new tool), and visual observations (visibility/fog/clouds).

---

## 1. Current Coverage

### Exposed Tools

| MCP Tool | OGD Collection | Stations | Update | User Questions Answered |
|----------|---------------|----------|--------|------------------------|
| `meteoswissCurrentWeather` | `ogd-smn` | ~160 | 10 min | "What's the temperature in Zurich right now?" |
| `meteoswissLocalForecast` | `ogd-local-forecasting` | ~6000 | 1 hour | "What's the weather forecast for Bern this week?" |
| `meteoswissPollenData` | `ogd-pollen` | ~15 | daily | "What are the pollen levels in Basel?" |
| `meteoswissStations` | `ogd-smn` (metadata) | ~160 | static | "Which weather stations are in canton Graubunden?" |

### Defined but Unused Collection IDs

These constants exist in `src/schemas/ogd-shared.ts` (lines 84-92) but no tool uses them:

| Constant | Collection ID | Notes |
|----------|--------------|-------|
| `SMN_PRECIP` | `ch.meteoschweiz.ogd-smn-precip` | ~140 precipitation-only stations |
| `SMN_TOWER` | `ch.meteoschweiz.ogd-smn-tower` | 3 tower stations |
| `NBCN` | `ch.meteoschweiz.ogd-nbcn` | 29 climate reference stations |
| `RADIOSOUNDING` | `ch.meteoschweiz.ogd-radiosounding` | Not yet published |

---

## 2. Complete OGD Catalog Inventory

### 2a. CSV Collections (12 total)

All CSV collections use the same STAC API pattern and can reuse our existing infrastructure (`ogd-data-store.ts`, `ogd-stac-client.ts`, `ogd-csv-parser.ts`).

| # | Collection ID | Description | Stations | Resolution | Status |
|---|--------------|-------------|----------|------------|--------|
| A1 | `ogd-smn` | Automatic weather stations — temperature, precipitation, wind, pressure, snow, humidity, sunshine, radiation | ~160 | 10-min, hourly, daily, monthly, yearly | **USED** |
| A2 | `ogd-smn-precip` | Automatic precipitation stations — precipitation only | ~140 | 10-min, hourly, daily, monthly, yearly | Defined, unused |
| A3 | `ogd-smn-tower` | Tower stations — temperature, wind, humidity, sunshine, radiation at 150-230m above ground | 3 | 10-min, hourly, daily, monthly, yearly | Defined, unused |
| A5 | `ogd-nime` | Manual precipitation stations — daily precipitation and snow depth (SMS-transmitted) | ~270 | Daily, monthly, yearly | New |
| A6 | `ogd-tot` | Totaliser precipitation stations — annual precipitation totals | ~60 | Yearly only | New |
| A7 | `ogd-pollen` | Pollen stations — concentration of 7 species (Alder, Birch, Hazel, Beech, Ash, Oak, Grasses) | ~16 | Hourly, daily, yearly | **USED** |
| A8 | `ogd-obs` | Meteorological visual observations — visibility, cloud cover, present/past weather, ground conditions | 8 | 2-8x daily | New |
| A9 | `ogd-phenology` | Phenological observations — phenophases of 26 plant species (bloom, leaf, fruit, color) | ~170 | Yearly | New |
| C1 | `ogd-nbcn` | Climate stations — homogeneous measurement series from National Basic Climatic Network | 29 | Daily, monthly, yearly | Defined, unused |
| C2 | `ogd-nbcn-precip` | Climate precipitation stations — homogeneous precipitation series | 46 | Daily, monthly, yearly | New |
| C8 | `ogd-climate-scenarios-ch2025` | Climate scenarios CH2025 per station — 30-year daily projections | variable | Daily (scenario) | New |
| E4 | `ogd-local-forecasting` | Local forecast data — blended forecast for all ZIP codes, stations, mountain POIs | ~6000 | Hourly, up to 192h | **USED** |

### 2b. Binary Format Collections (5 total)

These require format-specific parsers not currently in the project.

| # | Collection ID | Format | Description | Resolution | Assessment |
|---|--------------|--------|-------------|------------|------------|
| D1 | `ogd-radar-precip` | HDF5 | Precipitation radar composites (PRECIP, CombiPrecip/CPC) | 1km, every 5 min | High value (nowcasting) but HDF5 grid data is impractical for LLM text responses |
| D3 | `ogd-radar-hail` | HDF5 | Hail radar products — POH (probability of hail) and MESHS (max hail size) | 1km, every 5 min | Seasonal (Apr-Sep). Same HDF5 parsing challenge |
| E2 | `ogd-forecasting-icon-ch1` | GRIB2 | NWP model ICON-CH1-EPS — 1km grid, next 33 hours | 1km, every 3h | Massive files. `ogd-local-forecasting` already provides this data aggregated to stations |
| E3 | `ogd-forecasting-icon-ch2` | GRIB2 | NWP model ICON-CH2-EPS — 2.1km grid, next 120 hours | 2.1km, every 6h | Same as above but coarser. Pollen forecast parameters expected end April 2026 |
| C9 | `ogd-climate-scenarios-ch2025-grid` | NetCDF | Climate scenarios CH2025 on 1km grid | 1km grid | Per-station CSV version (C8) is better suited for LLM responses |

### 2c. Not Yet Available (expected 2026+)

| # | Dataset | Expected | Format | Notes |
|---|---------|----------|--------|-------|
| A4 | Soil moisture stations | 2026 | CSV (expected) | New station network, not yet published |
| B1 | Radio soundings (Payerne) | H1 2026 | CSV (expected) | `RADIOSOUNDING` already defined in code |
| B2 | RALMO (Raman-LIDAR) | TBD | Unknown | Specialized atmospheric research |
| B3 | LIDAR Ceilometer CHM15K | TBD | Unknown | Cloud base height measurements |
| B4 | Ozone — Total column (Dobson, Brewer) | TBD | Unknown | Arosa/Davos ozone measurements |
| B5 | Ozone — Profiles (soundings, SOMORA) | TBD | Unknown | Vertical ozone profiles |
| B6 | SACRaM (Alpine Climate Radiation) | TBD | Unknown | Radiation reference measurements |
| C3-C5 | Spatial climate analyses | Q1 2026 (expected) | Grid format | Temperature, precipitation, sunshine, radiation, hail |
| D2 | Reflectivity radar products | 2026 | HDF5 (expected) | Additional radar composites |
| D4 | Convection radar products | TBD | Unknown | Thunderstorm detection |
| D5 | Polar 3D radar products | TBD | Unknown | Volumetric radar data |
| E1 | Nowcasting | TBD | Unknown | Short-term precipitation forecasts |

**Also expected:** MeteoGate API (EDR) and OGC Feature API — these could provide a simpler JSON interface to grid data, potentially making radar/NWP accessible without binary parsing.

### 2d. Legacy/Non-OGD Collections (11 total, proprietary license)

These are hosted on the STAC API but are **not part of the OGD program** and have restrictive licenses. Not recommended for integration.

| Collection ID | Description | Format |
|--------------|-------------|--------|
| `ch.meteoschweiz.hagelgefaehrdung-korngroesse_10_jahre` | Hail hazard: 10-year return period | NetCDF + GeoTIFF |
| `ch.meteoschweiz.hagelgefaehrdung-korngroesse_20_jahre` | Hail hazard: 20-year return period | NetCDF + GeoTIFF |
| `ch.meteoschweiz.hagelgefaehrdung-korngroesse_50_jahre` | Hail hazard: 50-year return period | NetCDF + GeoTIFF |
| `ch.meteoschweiz.hagelgefaehrdung-korngroesse_100_jahre` | Hail hazard: 100-year return period | NetCDF + GeoTIFF |
| `ch.meteoschweiz.klimanormwerte-niederschlag_1961_1990` | Climate normals precipitation 1961-1990 | NetCDF + GeoTIFF |
| `ch.meteoschweiz.klimanormwerte-niederschlag_aktuelle_periode` | Climate normals precipitation 1991-2020 | NetCDF + GeoTIFF |
| `ch.meteoschweiz.klimanormwerte-sonnenscheindauer_1961_1990` | Climate normals sunshine 1961-1990 | NetCDF + GeoTIFF |
| `ch.meteoschweiz.klimanormwerte-sonnenscheindauer_aktuelle_periode` | Climate normals sunshine 1991-2020 | NetCDF + GeoTIFF |
| `ch.meteoschweiz.klimanormwerte-temperatur_1961_1990` | Climate normals temperature 1961-1990 | NetCDF + GeoTIFF |
| `ch.meteoschweiz.klimanormwerte-temperatur_aktuelle_periode` | Climate normals temperature 1991-2020 | NetCDF + GeoTIFF |
| `ch.meteoschweiz.klimaszenarien-raumklima` | Climate scenarios for indoor climate (SIA 2028) | ZIP |

**Note on climate normals:** CLAUDE.md mentions re-adding climate normals when `ch.meteoschweiz.ogd-climate-normals` is published. The OGD version does not exist yet — only these legacy proprietary-licensed grid collections are available. The OGD release schedule does not list a timeline for station-level climate normals in the OGD format.

---

## 3. Prioritized Recommendations

### Tier 1 — Add Next (high value, low effort)

#### 1. `ogd-smn-precip` → Merge into `meteoswissCurrentWeather`

| | |
|---|---|
| **Effort** | XS (1-2 hours) |
| **Value** | +140 precipitation stations, broader rain coverage |
| **Questions answered** | "Is it raining in [small town with no full weather station]?" |
| **Implementation** | Same CSV format as SMN. Check if `VQHA80.csv` already includes these stations. If not, add per-station CSV fallback. Reuses `getCsvData`, `resolveSmnStation`, existing CSV parser. |
| **Cache tier** | `realtime` (60s TTL) |

#### 2. `ogd-nbcn` + `ogd-nbcn-precip` → New `meteoswissClimateData` tool

| | |
|---|---|
| **Effort** | S (4-8 hours) |
| **Value** | Homogeneous climate series from 29+46 reference stations, going back decades |
| **Questions answered** | "What are typical January temperatures in Zurich?", "How has precipitation changed in Basel over 50 years?", "What's the average annual rainfall in Lugano?" |
| **Implementation** | Same CSV format. New Zod schema for query parameters (station, date range, aggregation). New data layer fetching monthly/yearly summaries. Station resolver can be shared. |
| **Cache tier** | `climate` (7-day TTL) |

#### 3. `ogd-obs` → New `meteoswissVisualObservations` or merge into current weather

| | |
|---|---|
| **Effort** | S (4-8 hours) |
| **Value** | Visibility distance, cloud cover/type, present weather phenomena (fog, thunderstorm, drizzle) |
| **Questions answered** | "Is it foggy?", "Can I see the mountains today?", "What's the visibility at the airport?" |
| **Implementation** | CSV format. Only 8 stations limits geographic coverage but includes major locations. Could merge into `meteoswissCurrentWeather` for stations that have both SMN and OBS data, or keep separate. |
| **Cache tier** | `realtime` (60s TTL) |
| **Consideration** | Only 8 stations. Merging into `currentWeather` as optional enrichment may be better than a standalone tool. |

### Tier 2 — Worthwhile, Lower Priority

#### 4. `ogd-radiosounding` → New `meteoswissRadioSounding`

| | |
|---|---|
| **Effort** | S (4-8 hours, once data is published) |
| **Value** | Atmospheric vertical profile from Payerne — temperature, humidity, wind at altitude |
| **Questions answered** | "What's the freezing level today?", "What are wind conditions at 3000m?" (pilots, paragliders) |
| **Status** | **Blocked** — collection ID already defined in code, awaiting publication (expected H1 2026) |
| **Cache tier** | `forecast` (1-hour TTL) |

#### 5. `ogd-phenology` → New `meteoswissPhenology`

| | |
|---|---|
| **Effort** | S (4-8 hours) |
| **Value** | Phenophase dates for 26 plant species from ~170 stations (cherry blossom, leaf coloring, grape harvest) |
| **Questions answered** | "When did the cherry trees bloom this year?", "Has spring arrived earlier over the decades?" |
| **Implementation** | Simple yearly CSV. Unique data — no other public source provides this for Switzerland. Low query frequency but high interest during spring. |
| **Cache tier** | `climate` (7-day TTL) |

#### 6. `ogd-climate-scenarios-ch2025` → New `meteoswissClimateScenarios`

| | |
|---|---|
| **Effort** | M (1-2 days) |
| **Value** | CH2025 climate projections per station — what temperatures/precipitation to expect in 2040, 2060, 2080 |
| **Questions answered** | "What will summers in Zurich be like in 2060?", "How much warmer will it get in Switzerland?" |
| **Implementation** | CSV inside ZIP archives on CSCS storage. Needs ZIP extraction, multiple scenario handling (RCP/SSP), and careful response formatting to explain uncertainty ranges. |
| **Cache tier** | `climate` (7-day TTL) |

### Tier 3 — Not Recommended

| Collection | Why Not |
|-----------|---------|
| `ogd-smn-tower` | Only 3 stations (Bantiger, Schaffhausen, Chrischona). Minimal added coverage. Data format identical to SMN — could add trivially later if demand emerges. |
| `ogd-nime` | ~270 manual precipitation stations but daily resolution only. SMN + SMN-precip already provide ~300 stations at 10-minute resolution. Manual readings arrive with delay. |
| `ogd-tot` | Yearly precipitation totals from ~60 totaliser gauges. Too coarse for any real-time or forecast query. Climate research use only, and NBCN covers this better. |
| `ogd-radar-precip` | **High value but impractical.** HDF5 format requires `h5wasm` or similar dependency. Output is a 2D grid (480x640 pixels), not station data. Returning grid data to an LLM is impractical. Could return a text summary ("heavy precipitation over Lake Zurich") but parsing effort is L. Better served by radar image URL passthrough or Open-Meteo. |
| `ogd-radar-hail` | Same HDF5 challenges. Seasonal (April-September only). POH/MESHS are grid products. |
| `ogd-forecasting-icon-ch1/ch2` | GRIB2 format, massive files (hundreds of MB per run). Grid data. **`ogd-local-forecasting` already provides the same NWP output aggregated to stations/postal codes.** No added value over what we already expose. |
| `ogd-climate-scenarios-ch2025-grid` | NetCDF grid data. The per-station CSV version (C8) provides the same information in an LLM-friendly format. |
| Legacy hail/climate collections | Proprietary license, not OGD. Grid formats. Wait for potential OGD re-release. |

---

## 4. Implementation Patterns

### Recipe for Adding a CSV Collection

The existing codebase provides a well-defined pattern. Each new CSV collection requires:

1. **Add collection ID** to `OGD_COLLECTIONS` in `src/schemas/ogd-shared.ts`
2. **Create input schema** in `src/schemas/ogd-{name}.ts` using Zod
3. **Create data layer** in `src/data/ogd-{name}.ts` — uses `getCsvData()` from `ogd-data-store.ts`, `getCollection()` from `ogd-stac-client.ts`
4. **Register tool** in `src/server.ts` following existing `server.tool()` pattern
5. **Add fixture mapping** in `ogd-data-store.ts` `resolveFixturePath()` — fail-fast on unmapped URLs
6. **Add fixture CSVs** to `test/__fixtures__/ogd/`
7. **Add integration test** in `test/integration/ogd-{name}.test.ts`

### Effort Calibration

| Size | Hours | Description | Example |
|------|-------|-------------|---------|
| XS | 1-2 | Merge data into existing tool, same format/schema | SMN-precip into currentWeather |
| S | 4-8 | New tool using existing patterns, new schema + data layer + tests | NBCN climate data, visual observations |
| M | 1-2 days | New tool needing new parsing or complex aggregation | Climate scenarios (ZIP+CSV, multiple scenarios) |
| L | 3-5 days | New format parser + new tool | Radar HDF5 (not recommended) |

### Cache Tier Mapping

| Proposed Addition | Cache Tier | TTL | Rationale |
|------------------|-----------|-----|-----------|
| SMN-precip (merge) | `realtime` | 60s | Same real-time measurement data as SMN |
| NBCN / NBCN-precip | `climate` | 7 days | Historical data, updated monthly at most |
| Visual observations | `realtime` | 60s | Multiple daily observations, freshness matters |
| Radio soundings | `forecast` | 1 hour | Twice-daily launches, moderate freshness need |
| Phenology | `climate` | 7 days | Yearly observations, very stable |
| Climate scenarios | `climate` | 7 days | Static scenario data, rarely updated |

---

## 5. Binary Format Strategy

Three approaches for radar and NWP data, in order of preference:

### Option A: Skip (recommended for now)

The `ogd-local-forecasting` collection already distills ICON-CH1-EPS and ICON-CH2-EPS output into station-level forecasts. This is the same data the MeteoSwiss app and website use. There is no user-facing value in also parsing the raw NWP GRIB2 files.

For radar, the main use case is nowcasting ("will it rain in the next 2 hours?"). This is better addressed when MeteoSwiss publishes the nowcasting product (E1, timeline TBD).

### Option B: Open-Meteo Proxy (future)

[Open-Meteo](https://open-meteo.com/) provides ICON-CH1/CH2 model output as a JSON API at no cost. This is noted in `CLAUDE.md` as an open task. It would give access to hourly wind, sunshine, cloud cover, and precipitation forecasts without parsing GRIB2. Consider this as a future enhancement when more forecast parameters are needed.

### Option C: Image URL Passthrough (future)

For radar, return the MeteoSwiss radar image URL rather than parsing HDF5. The MeteoSwiss app and website display radar as map overlays. An LLM could reference/link the image even though it cannot interpret pixel data. Low effort but limited utility.

---

## 6. Tool Count Considerations

| State | Tool Count | Tools |
|-------|-----------|-------|
| Current | 6 | currentWeather, localForecast, pollenData, stations, search, fetch |
| + Tier 1 | 8-9 | + climateData, visualObservations (SMN-precip merged, not a new tool) |
| + Tier 2 | 10-12 | + radioSounding, phenology, climateScenarios |

LLM tool selection works well up to ~10-15 tools. The `meteoswiss` prefix on all weather tools aids selection by grouping them visually. After Tier 1+2 additions, the count (10-12) remains comfortable.

**Merging strategy** to keep count low:
- SMN-precip: merge into `meteoswissCurrentWeather` (no new tool)
- Visual observations: consider merging into `meteoswissCurrentWeather` for overlapping stations
- NBCN + NBCN-precip: single `meteoswissClimateData` tool with parameter selection

---

## 7. Open Questions

1. **Does the consolidated `VQHA80.csv` already include SMN-precip stations?** If yes, we may already have partial coverage. Need to check station lists against SMN-precip metadata.

2. **NBCN: separate tool or "historical weather"?** Could combine NBCN with per-station historical CSVs from SMN (`_historical` temporal window) into a unified `meteoswissHistoricalWeather` tool. Needs design discussion.

3. **Climate normals (CLAUDE.md open task):** The OGD version (`ogd-climate-normals`) does not exist. Only legacy proprietary-licensed grid collections are available. Recommend waiting, or computing normals from NBCN monthly averages as a workaround.

4. **Soil moisture demand:** Expected 2026. Useful for agriculture queries ("Is the soil dry?") but niche. Monitor publication timeline.

5. **MeteoGate / OGC APIs:** MeteoSwiss is developing EDR (Environmental Data Retrieval) and OGC Feature APIs. These could make grid data (radar, NWP) accessible as point queries in JSON format, eliminating the binary format barrier. Monitor progress.

---

## 8. Summary Table

| Collection | Format | Recommendation | Priority | Effort | New Tool? |
|-----------|--------|---------------|----------|--------|-----------|
| `ogd-smn` | CSV | Already exposed | -- | -- | -- |
| `ogd-smn-precip` | CSV | **Add: merge into currentWeather** | Tier 1 | XS | No |
| `ogd-smn-tower` | CSV | Skip (3 stations) | Tier 3 | -- | -- |
| `ogd-nime` | CSV | Skip (daily manual, SMN covers better) | Tier 3 | -- | -- |
| `ogd-tot` | CSV | Skip (yearly only) | Tier 3 | -- | -- |
| `ogd-pollen` | CSV | Already exposed | -- | -- | -- |
| `ogd-obs` | CSV | **Add: visual observations** | Tier 1 | S | Yes or merge |
| `ogd-phenology` | CSV | **Add: phenology** | Tier 2 | S | Yes |
| `ogd-nbcn` | CSV | **Add: climate data** | Tier 1 | S | Yes |
| `ogd-nbcn-precip` | CSV | **Add: merge into climate data** | Tier 1 | S | No (same tool) |
| `ogd-local-forecasting` | CSV | Already exposed | -- | -- | -- |
| `ogd-climate-scenarios-ch2025` | CSV+ZIP | **Add: climate scenarios** | Tier 2 | M | Yes |
| `ogd-radar-precip` | HDF5 | Skip (binary grid) | Tier 3 | -- | -- |
| `ogd-radar-hail` | HDF5 | Skip (binary grid) | Tier 3 | -- | -- |
| `ogd-forecasting-icon-ch1` | GRIB2 | Skip (local-forecasting covers this) | Tier 3 | -- | -- |
| `ogd-forecasting-icon-ch2` | GRIB2 | Skip (local-forecasting covers this) | Tier 3 | -- | -- |
| `ogd-climate-scenarios-ch2025-grid` | NetCDF | Skip (per-station CSV available) | Tier 3 | -- | -- |
| `ogd-radiosounding` | CSV (exp.) | **Add: once published** | Tier 2 | S | Yes |

---

## 9. References

- [MeteoSwiss Open Data Documentation](https://opendatadocs.meteoswiss.ch/)
- [Available Data Catalog](https://opendatadocs.meteoswiss.ch/en/general/available-data)
- [Release Schedule](https://opendatadocs.meteoswiss.ch/en/general/release-schedule)
- [STAC API Collections](https://data.geo.admin.ch/api/stac/v1/collections)
- [OGD page on meteoswiss.admin.ch](https://www.meteoswiss.admin.ch/services-and-publications/service/open-data.html)
- [Open-Meteo ICON-CH models](https://open-meteo.com/en/docs)
- [MeteoGate (in development)](https://opendatadocs.meteoswiss.ch/en/general/meteogate)
