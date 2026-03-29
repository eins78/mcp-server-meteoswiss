---
name: meteoswiss-ogd
description: >-
  Use when the user asks about Swiss weather, MeteoSwiss data, or Swiss weather
  forecasts and no MCP server is available. Covers current weather, forecasts,
  pollen, and station discovery via direct HTTP. No API key required.
globs: []
license: CC0-1.0
metadata:
  author: eins78
  repo: https://github.com/eins78/meteoswiss-llm-tools
  version: 1.0.0-rc.1
compatibility: claude-code, cursor
---

# MeteoSwiss Open Data

Access Swiss weather data directly from MeteoSwiss Open Government Data. Free, no API key, no authentication. Data license: Open Use (OGD).

All data comes from `data.geo.admin.ch`. CSVs use **semicolon** (`;`) delimiters, NOT commas.

## Quick Reference

| Data | URL | Encoding | Updates |
|------|-----|----------|---------|
| Current weather (all stations) | `https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv` | UTF-8 | 10 min |
| Station metadata | STAC collection `ch.meteoschweiz.ogd-smn` → asset `ogd-smn_meta_stations.csv` | Latin1 | Daily |
| Forecast point metadata | STAC collection `ch.meteoschweiz.ogd-local-forecasting` → asset with key containing `meta_point.csv` | Latin1 | Daily |
| Forecast data | STAC items in `ch.meteoschweiz.ogd-local-forecasting` → parameter CSV assets | UTF-8 | Hourly |
| Pollen data | `https://data.geo.admin.ch/ch.meteoschweiz.ogd-pollen/{ABBR}/ogd-pollen_{ABBR}_d_now.csv` | Latin1 | Daily |

STAC API base: `https://data.geo.admin.ch/api/stac/v1`

## 1. Get Current Weather

Fetches real-time measurements from all ~160 Swiss weather stations in one CSV.

```bash
# Download current measurements
curl -s 'https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv' \
  | head -1  # show header

# Get weather for Zurich (station SMA)
curl -s 'https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv' \
  | awk -F';' 'NR==1 || $1=="SMA"'
```

**Key columns** in VQHA80.csv:

| Column | Meaning | Unit |
|--------|---------|------|
| `Station/Location` | Station abbreviation (e.g., SMA, BER, GVE) | — |
| `Date` | Timestamp in YYYYMMDDHHmm format (UTC) | — |
| `tre200s0` | Air temperature 2m | °C |
| `ure200s0` | Relative humidity 2m | % |
| `rre150z0` | Precipitation 10min | mm |
| `fu3010z0` | Wind speed | km/h |
| `fu3010z1` | Wind gust peak | km/h |
| `dkl010z0` | Wind direction | ° |
| `prestas0` | Station-level pressure | hPa |
| `pp0qffs0` | Sea-level pressure (QFF) | hPa |

Missing values appear as empty fields or `-`.

**With jq** (parse CSV to JSON):

```bash
curl -s 'https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv' \
  | awk -F';' 'NR==1{for(i=1;i<=NF;i++) h[i]=$i; next} $1=="SMA"{for(i=1;i<=NF;i++) printf "%s: %s\n", h[i], $i}'
```

**Agent alternative** (WebFetch tool):

```
Use WebFetch to fetch: https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv
Then parse the semicolon-delimited CSV. Find the row where the first column matches the station abbreviation.
```

## 2. Find Stations

### Weather stations (SwissMetNet)

```bash
# Step 1: Get the metadata CSV URL from the STAC collection
curl -s 'https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-smn' \
  | jq -r '.assets["ogd-smn_meta_stations.csv"].href'

# Step 2: Download and search (Latin1 encoded!)
curl -s 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/ogd-smn_meta_stations.csv' \
  | iconv -f latin1 -t utf-8 \
  | awk -F';' 'NR==1 || tolower($0) ~ /zurich|zürich/'
```

Station metadata columns: `station_abbr`, `station_name`, `station_canton`, `station_height_masl`, `station_coordinates_wgs84_lat`, `station_coordinates_wgs84_lon`.

### Forecast locations (~6000 points)

```bash
# Get forecast point metadata (stations, postal codes, mountains)
curl -s 'https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-local-forecasting' \
  | jq -r '.assets | to_entries[] | select(.key | contains("meta_point")) | .value.href'

# Download and search for a postal code or place name
# NOTE: Asset key has a known typo "forcasting" — always fetch the URL from STAC, don't hardcode it
curl -s "$(curl -s 'https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-local-forecasting' \
  | jq -r '.assets | to_entries[] | select(.key | contains("meta_point")) | .value.href')" \
  | iconv -f latin1 -t utf-8 \
  | awk -F';' 'NR==1 || $3 ~ /8001/'  # search by postal code
```

Point metadata columns: `point_id`, `point_type_id` (1=station, 2=postal_code, 3=mountain), `postal_code`, `station_abbr`, `point_name`, `point_height_masl`, `point_coordinates_wgs84_lat`, `point_coordinates_wgs84_lon`.

## 3. Get Forecasts

Forecasts require two HTTP requests: get the latest STAC item, then download parameter CSVs.

```bash
# Step 1: Get the latest forecast item ID
ITEM=$(curl -s 'https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-local-forecasting/items?limit=10' \
  | jq -r '[.features[].id] | sort | reverse | .[0]')
echo "Latest forecast item: $ITEM"

# Step 2: List available parameter assets
curl -s "https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-local-forecasting/items/$ITEM" \
  | jq -r '.assets | keys[]' | head -20

# Step 3: Download a parameter CSV (e.g., daily max temperature)
# Asset keys look like: vnut12.lssw.YYYYMMDDHHMM.tre200dx.csv
ASSET_KEY=$(curl -s "https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-local-forecasting/items/$ITEM" \
  | jq -r '.assets | keys[] | select(contains("tre200dx"))' | sort | tail -1)

ASSET_URL=$(curl -s "https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-local-forecasting/items/$ITEM" \
  | jq -r ".assets[\"$ASSET_KEY\"].href")

# Step 4: Filter for a specific point_id (e.g., 48 for Zurich station)
curl -s "$ASSET_URL" | awk -F';' 'NR==1 || $1=="48"'
```

**Forecast CSV columns**: `point_id;point_type_id;Date;PARAMETER_VALUE`

### Forecast parameters

**For stations** (point_type_id=1) — daily values:

| Parameter | Meaning | Unit |
|-----------|---------|------|
| `tre200dx` | Daily max temperature | °C |
| `tre200dn` | Daily min temperature | °C |
| `rka150d0` | Daily precipitation total | mm |
| `jp2000d0` | Weather icon code (see REFERENCE.md) | — |

**For postal codes/mountains** (point_type_id=2,3) — hourly values:

| Parameter | Meaning | Unit |
|-----------|---------|------|
| `tre200h0` | Hourly temperature | °C |
| `rre150h0` | Hourly precipitation | mm |
| `jww003i0` | Hourly weather icon code | — |

To get daily min/max from hourly data: group by date (first 8 chars of timestamp), take min/max of temperature values.

### Common Swiss locations

| Location | point_id | point_type_id |
|----------|----------|---------------|
| Zurich (station) | 48 | 1 |
| Bern (station) | 29 | 1 |
| Geneva (station) | 53 | 1 |

Look up other locations using the forecast point metadata (Section 2).

## 4. Get Pollen Data

```bash
# Station abbreviations: BAS, BER, BUC, DAV, GEN, LAU, LOG, LUG, LUZ, MUN, NEU, VIS, ZUE
# Use lowercase in URLs

# Get latest pollen data for Zurich
curl -s 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-pollen/zue/ogd-pollen_zue_d_now.csv' \
  | iconv -f latin1 -t utf-8 \
  | awk -F';' 'NR==1 || NR==NF'  # header + latest row
```

Pollen columns: `station_abbr`, `reference_timestamp`, `Date`, then one column per pollen type (e.g., `BIR`=birch, `GRA`=grass, `HIE`=plantain). Values are particles/m³.

## CSV Format Reference

- **Delimiter**: semicolon (`;`)
- **Timestamps**: `YYYYMMDDHHmm` in UTC (e.g., `202603291200` = 2026-03-29 12:00 UTC)
- **Missing values**: empty field or `-`
- **Encoding**: Data CSVs are UTF-8. Metadata CSVs (stations, points, parameters) are Latin1 — pipe through `iconv -f latin1 -t utf-8` before processing
- **Header**: First row is always the header

## Error Handling

- **Station not found**: Check station metadata CSV (Section 2) for valid abbreviations
- **Empty CSV or no data**: Station may be temporarily offline — try a different nearby station
- **STAC returns no items**: Increase the `limit` parameter (e.g., `?limit=20`)
- **Encoding garbled**: You're reading a Latin1 CSV as UTF-8 — use `iconv -f latin1 -t utf-8`
- **403/404 on pollen URL**: Verify station abbreviation is lowercase and is a pollen station (only ~13 stations have pollen data)

## MCP Server Alternative

For complex queries (fuzzy location search, geocoding, structured JSON responses), use the MeteoSwiss MCP server instead:

```bash
# Add to Claude Code
claude mcp add meteoswiss https://meteoswiss-mcp.ars.is/mcp
```

Or dispatch a subagent with the MCP server enabled for one-off complex queries while using direct HTTP for simple lookups.

## Full Parameter Reference

See `${CLAUDE_SKILL_DIR}/REFERENCE.md` for complete tables of all measurement parameters, forecast parameters, and weather icon codes.
