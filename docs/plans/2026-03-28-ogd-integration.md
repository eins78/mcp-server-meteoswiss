# Plan: Integrate MeteoSwiss Open Government Data

> Replace broken HTML scraping with structured OGD data access via STAC API. Add 6 new tools covering real-time measurements, forecasts, climate, pollen, radio soundings, and station discovery.

## Status

- **Phase:** Draft
- **Type:** feature
- **Branch:** `idea/ogd-integration`

## Motivation

The MCP server's primary tool (`meteoswissWeatherReport`) is broken -- its endpoint returns HTTP 404. MeteoSwiss launched Open Government Data (OGD) in May 2025, providing structured CSV/JSON data via STAC API for measurements, forecasts, climate, pollen, and more. No authentication required, CC BY 4.0 license.

This plan replaces the broken HTML-scraping approach with direct OGD data access, expanding coverage from 3 regional weather reports to real-time measurements from 158 stations, 9-day forecasts for 5629 locations, climate normals, pollen data, and radio soundings.

See also: [MeteoSwiss Open Data Research Report](../meteoswiss-open-data-report.md)

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Audience | Layered API (simple defaults + power-user params) | Serves both casual weather queries and data-savvy users |
| Broken weather report tool | Deprecate (OGD local forecasts replace it) | OGD provides richer, location-specific forecasts |
| Scope | All OGD datasets available as CSV/JSON | Skip binary formats (GRIB2 radar, HDF5 NWP) for now |
| Binary format data | Skip; add Open-Meteo proxy for NWP later | GRIB2/HDF5 parsing in Node.js is impractical |
| Architecture | Shared data layer | Matches existing codebase patterns, avoids duplication |
| Tool grouping | 6 grouped tools | Balance between specificity and tool list length |
| Caching | Disk-based CSV cache with TTL refresh | Low memory, fast after initial download |
| Location lookup | Fuzzy name matching | Simple, no external deps; swisstopo geocoding later |
| Typing | Zod schemas at all data boundaries | Strong typing from official MeteoSwiss metadata schemas |

## Branches

Implementation branches fan out from this plan after approval:

| Branch | Scope |
|---|---|
| `feature/ogd-integration-infra` | Shared infrastructure: CSV parser, STAC client, data store, station resolver |
| `feature/ogd-current-weather` | `getCurrentWeather` tool + `listStations` tool |
| `feature/ogd-local-forecast` | `getLocalForecast` tool |
| `feature/ogd-climate-data` | `getClimateData` tool |
| `feature/ogd-pollen-sounding` | `getPollenData` + `getRadioSounding` tools |
| `feature/ogd-deprecate-weather-report` | Deprecate old tool, update prompts |

## Design

### Shared Infrastructure

Four new modules provide the foundation for all OGD tools:

#### `src/support/ogd-csv-parser.ts` -- MeteoSwiss CSV Parser

Parses MeteoSwiss CSV files into typed rows.

- Semicolon delimiter (`;`)
- Windows-1252 and Latin1/ISO-8859-1 encoding support (auto-detect or configurable)
- Missing values (`-` or empty fields) -> `null`
- Zod schema validation per row -- each dataset defines its row schema, parser validates against it
- Returns `Array<z.infer<RowSchema>>` for type-safe downstream use

#### `src/data/ogd-stac-client.ts` -- STAC API Client

Browses the swisstopo STAC API at `https://data.geo.admin.ch/api/stac/v1/`.

Functions:
- `getCollection(id)` -> collection metadata + asset URLs (for metadata CSVs)
- `getLatestItem(id)` -> most recent item (used for forecast data -- gets latest forecast run)
- `getItem(id, itemId)` -> specific item (used for station data)
- `listItems(id, options?)` -> paginated item list with optional bbox/datetime filters

Uses existing `fetchJson` from `http-communication.ts`. Zod schemas validate STAC API responses.

Relevant STAC response types to model with Zod:
- `StacCollection` -- id, title, description, extent, assets (metadata files)
- `StacItem` -- id, geometry, properties (datetime, created, updated), assets (data files)
- `StacAsset` -- href, type, created, updated, `file:checksum`

#### `src/data/ogd-data-store.ts` -- Disk-Based CSV Cache

Downloads, caches, and serves parsed CSV data from disk.

- Configurable cache directory (env var `OGD_CACHE_DIR`, default: OS temp dir + `/meteoswiss-ogd/`)
- TTL-based refresh per dataset type:
  - Real-time measurements: 60 seconds (data updates every 10 min, but avoid hammering)
  - Forecasts: 1 hour (new forecasts hourly)
  - Metadata (stations, parameters): 24 hours (changes rarely)
  - Climate data: 7 days (essentially static)
- Uses ETags for conditional downloads (existing `http-communication.ts` support)
- File naming: `{collectionId}/{itemId}/{assetKey}` mirroring STAC structure
- Provides `getData<T>(collectionId, itemId, assetKey, rowSchema: ZodSchema<T>)` -> `T[]`
- Thread-safe: uses file locks or atomic renames to prevent partial reads during downloads

#### `src/data/ogd-station-resolver.ts` -- Station & Location Resolver

Resolves natural language queries to specific stations or forecast points.

Data sources (loaded lazily, cached 24h):
- `ogd-smn_meta_stations.csv` -- 158 weather stations with names, cantons, coordinates
- `ogd-local-forecasting_meta_point.csv` -- 5629 forecast points (stations + postal codes + mountain POIs)

Functions:
- `resolveStation(query, options?)` -> best match + alternatives
  - Matches against: station name, station abbreviation, postal code, canton abbreviation
  - Case-insensitive substring matching
  - Returns `{ match: Station, alternatives: Station[], confidence: 'exact' | 'fuzzy' }`
- `resolvePostalCode(code)` -> forecast point for a postal code
- `listStations(filters?)` -> filtered station list

Zod schemas for station metadata:
```
StationSchema: { abbr, name, canton, wigos_id, type, height_masl, lat, lon, lv95_east, lv95_north, data_since }
ForecastPointSchema: { point_id, point_type_id, station_abbr?, postal_code?, name, height_masl, lat, lon }
```

### Tools

#### Tool 1: `getCurrentWeather`

Real-time measurements from Swiss automatic weather stations.

**Collections**: `ch.meteoschweiz.ogd-smn`, `ch.meteoschweiz.ogd-smn-precip`, `ch.meteoschweiz.ogd-smn-tower`

**Input schema** (Zod):
```typescript
{
  station: z.string().min(1)           // Station name, abbreviation, or postal code
  parameters: z.array(z.enum([         // Optional parameter filter
    'temperature', 'precipitation', 'wind', 'humidity',
    'pressure', 'sunshine', 'radiation', 'snow', 'all'
  ])).optional().default(['temperature', 'precipitation', 'wind', 'humidity'])
  language: z.enum(['de', 'fr', 'it', 'en']).optional().default('de')
}
```

**Output**: Structured JSON:
```typescript
{
  station: { name, abbreviation, canton, elevation, coordinates: { lat, lon } }
  timestamp: string           // ISO 8601 UTC
  measurements: {
    temperature?: { value, unit: 'C', description }
    precipitation?: { value, unit: 'mm', description }
    wind?: { speed: { value, unit: 'km/h' }, direction: { value, unit: 'deg' }, gust?: { value, unit: 'km/h' } }
    humidity?: { value, unit: '%' }
    pressure?: { station: { value, unit: 'hPa' }, sea_level?: { value, unit: 'hPa' } }
    sunshine?: { value, unit: 'min' }
    radiation?: { value, unit: 'W/m2' }
    snow_depth?: { value, unit: 'cm' }
  }
  source: 'MeteoSwiss OGD'
}
```

**Data flow**:
1. Station resolver: query -> station abbreviation
2. Data store: fetch `VQHA80.csv` (consolidated real-time, all stations, ~25KB)
3. CSV parser: parse, filter to matched station row
4. Map parameter codes (`tre200s0` -> `temperature.value`) using parameter metadata
5. Return structured response

**Fallback to per-station CSV**: The consolidated `VQHA80.csv` has 20 parameters. The per-station 10-min CSV (`ogd-smn_{station}_t_now.csv`) has 33 parameters. When `parameters` includes `'all'` or a parameter not in the consolidated CSV (e.g., soil temperature, ground surface temp), fetch the per-station file instead.

#### Tool 2: `getLocalForecast`

Multi-day weather forecast for any Swiss location.

**Collection**: `ch.meteoschweiz.ogd-local-forecasting`

**Input schema**:
```typescript
{
  location: z.string().min(1)          // Postal code, station name, or place name
  days: z.number().int().min(1).max(9).optional().default(5)
  detail: z.enum(['summary', 'hourly']).optional().default('summary')
  language: z.enum(['de', 'fr', 'it', 'en']).optional().default('de')
}
```

**Output** (summary mode):
```typescript
{
  location: { name, type: 'station' | 'postal_code' | 'mountain', elevation, coordinates }
  generated: string            // Forecast generation timestamp
  forecast: Array<{
    date: string               // YYYY-MM-DD
    temperature: { min, max, unit: 'C' }
    precipitation: { total, unit: 'mm', probability?: number }
    wind: { speed_avg, gust_max, direction, unit: 'km/h' }
    sunshine: { duration, unit: 'min' }
    cloud_cover: { low, medium, high }     // Fractions 0-1
    weather_icon: number                    // MeteoSwiss pictogram code
  }>
  source: 'MeteoSwiss OGD'
}
```

**Data flow**:
1. Station resolver: query -> `point_id` + `point_type_id`
2. STAC client: get latest forecast item (e.g., `20260328-ch`)
3. Data store: download key parameter CSVs to disk
4. CSV parser: parse each file, filter rows by `point_id` + `point_type_id`
5. Aggregate into daily summaries or hourly detail
6. Return structured response

**Key parameters** (summary mode): `tre200dx`, `tre200dn`, `rka150d0`, `fu3010h0`, `fu3010h1`, `dkl010h0`, `sre000h0`, `nprolohs`, `npromths`, `nprohihs`, `jp2000d0`

**Hourly mode** adds: `tre200h0`, `rre150h0`, `jww003i0`

#### Tool 3: `getClimateData`

Historical climate data -- normals and long-term homogeneous series.

**Collections**: `ch.meteoschweiz.ogd-climate-normals`, `ch.meteoschweiz.ogd-nbcn`, `ch.meteoschweiz.ogd-nbcn-precip`

**Input schema**:
```typescript
{
  station: z.string().min(1)
  type: z.enum(['normals', 'homogeneous', 'precipitation'])
  month: z.number().int().min(1).max(12).optional()
  parameter: z.enum(['temperature', 'precipitation', 'sunshine', 'all']).optional().default('all')
  language: z.enum(['de', 'fr', 'it', 'en']).optional().default('de')
}
```

#### Tool 4: `getPollenData`

Current pollen concentrations from monitoring stations.

**Collection**: `ch.meteoschweiz.ogd-pollen`

**Input schema**:
```typescript
{
  station: z.string().optional()
  language: z.enum(['de', 'fr', 'it', 'en']).optional().default('de')
}
```

#### Tool 5: `getRadioSounding`

Atmospheric profile data from Payerne.

**Collection**: `ch.meteoschweiz.ogd-radiosounding`

**Input schema**:
```typescript
{
  date: z.string().optional()          // ISO date, defaults to latest
  language: z.enum(['de', 'fr', 'it', 'en']).optional().default('de')
}
```

**Output**:
```typescript
{
  station: { name: 'Payerne', abbreviation: 'PAY', canton: 'VD', elevation: 491, coordinates: { lat, lon } }
  launch_time: string
  profile: Array<{
    pressure: { value: number, unit: 'hPa' }
    altitude: { value: number, unit: 'm' }
    temperature: { value: number, unit: 'C' }
    dew_point: { value: number, unit: 'C' }
    wind_speed: { value: number, unit: 'km/h' }
    wind_direction: { value: number, unit: 'deg' }
    humidity: { value: number, unit: '%' }
  }>
  source: 'MeteoSwiss OGD'
}
```

#### Tool 6: `listStations`

Discover and search weather stations and forecast points.

**Input schema**:
```typescript
{
  search: z.string().optional()
  canton: z.string().length(2).optional()
  type: z.enum(['weather', 'precipitation', 'tower', 'pollen', 'phenology', 'forecast', 'all']).optional().default('weather')
  minElevation: z.number().optional()
  maxElevation: z.number().optional()
  limit: z.number().int().min(1).max(100).optional().default(20)
}
```

### Deprecation: `meteoswissWeatherReport`

Tool stays registered but returns a deprecation message pointing to `getLocalForecast` and `getCurrentWeather`. Remove after one release cycle along with `src/data/weather-report-data.ts`, `src/schemas/weather-report.ts`, `src/tools/meteoswiss-weather-report.ts`. Update the 4 MCP prompts to reference new tools.

## File Organization

```
src/
  support/
    ogd-csv-parser.ts              # NEW: MeteoSwiss CSV parsing
  data/
    ogd-stac-client.ts             # NEW: STAC API client
    ogd-data-store.ts              # NEW: Disk-based CSV cache
    ogd-station-resolver.ts        # NEW: Fuzzy station lookup
    ogd-current-weather.ts         # NEW: Data layer for getCurrentWeather
    ogd-local-forecast.ts          # NEW: Data layer for getLocalForecast
    ogd-climate-data.ts            # NEW: Data layer for getClimateData
    ogd-pollen-data.ts             # NEW: Data layer for getPollenData
    ogd-radio-sounding.ts          # NEW: Data layer for getRadioSounding
    ogd-station-list.ts            # NEW: Data layer for listStations
  schemas/
    ogd-shared.ts                  # NEW: Shared types (station, coordinates, etc.)
    ogd-current-weather.ts         # NEW: Input + output schemas
    ogd-local-forecast.ts          # NEW
    ogd-climate-data.ts            # NEW
    ogd-pollen-data.ts             # NEW
    ogd-radio-sounding.ts          # NEW
    ogd-station-list.ts            # NEW
  tools/
    ogd-current-weather.ts         # NEW: Tool adapter
    ogd-local-forecast.ts          # NEW
    ogd-climate-data.ts            # NEW
    ogd-pollen-data.ts             # NEW
    ogd-radio-sounding.ts          # NEW
    ogd-station-list.ts            # NEW
  server.ts                        # MODIFIED: Register new tools, deprecate old

test/
  __fixtures__/ogd/
    stac/                          # STAC API response fixtures
    measurements/                  # Station measurement CSV fixtures
    forecasts/                     # Forecast CSV fixtures
    climate/                       # Climate data fixtures
    pollen/                        # Pollen data fixtures
    sounding/                      # Radio sounding fixtures
    metadata/                      # Station/parameter metadata fixtures
  unit/
    ogd-csv-parser.test.ts
    ogd-stac-client.test.ts
    ogd-data-store.test.ts
    ogd-station-resolver.test.ts
  integration/
    ogd-current-weather.test.ts
    ogd-local-forecast.test.ts
    ogd-climate-data.test.ts
    ogd-pollen-data.test.ts
    ogd-radio-sounding.test.ts
    ogd-station-list.test.ts
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OGD_CACHE_DIR` | `{os.tmpdir()}/meteoswiss-ogd/` | Directory for cached CSV files |
| `OGD_CACHE_TTL_REALTIME` | `60000` (60s) | Cache TTL for real-time measurements |
| `OGD_CACHE_TTL_FORECAST` | `3600000` (1h) | Cache TTL for forecast data |
| `OGD_CACHE_TTL_METADATA` | `86400000` (24h) | Cache TTL for station/parameter metadata |
| `OGD_CACHE_TTL_CLIMATE` | `604800000` (7d) | Cache TTL for climate data |

## Error Handling

- **Station not found**: Return error with similar matches ("Did you mean...?")
- **Data unavailable**: Clear error. Fall back to stale cache if available, with `stale_data: true` flag.
- **Parameter not measured**: Return `null` for unmeasured values. Include `available_parameters`.
- **STAC API down**: Error suggesting retry. Cache STAC responses to survive brief outages.
- **CSV encoding**: Auto-detect. If decoding fails, log warning and attempt raw UTF-8 parse.

## Attribution

All tool responses include `source: 'MeteoSwiss OGD'` to satisfy CC BY 4.0 requirements.

## Future Enhancements (Not in Scope)

- Open-Meteo proxy for NWP model data (ICON-CH1/CH2 in JSON)
- Swisstopo geocoding API for place name -> coordinates resolution
- MCP resources for station metadata (static data, loaded once)
- Radar data visualization via image URLs
- Nowcasting (MeteoSwiss status: "planning pending")
