# Available Tools

## meteoswissLocalForecast

Get a multi-day weather forecast for any Swiss location.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `location` | string | Yes | Postal code ("8001"), station abbreviation ("ZUE"), or place name ("Zurich") |
| `days` | number | No | Number of forecast days, 1-9 (default: 5) |

**Returns:** Daily forecasts with temperature (min/max), precipitation, weather description, and weather icons.

**Try:** "What's the weather forecast for Zurich this week?" or "Will it rain in Bern tomorrow?"

## meteoswissCurrentWeather

Get real-time measurements from any of ~160 Swiss automatic weather stations. Updated every 10 minutes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `station` | string | No | Station name ("Zurich"), abbreviation ("SMA"), or address ("Bahnhofplatz 1 Bern") |
| `coordinates` | object | No | `{ lat, lon }` in WGS84 — finds nearest station |

Provide either `station` or `coordinates` (not both).

**Returns:** Temperature, precipitation, wind speed/direction, humidity, pressure, sunshine duration, and more.

**Try:** "What's the temperature in Zurich right now?" or "How windy is it at Jungfraujoch?"

## meteoswissStations

Search and browse the MeteoSwiss automatic weather station network.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `search` | string | No | Search by station name (supports diacritics) |
| `canton` | string | No | Filter by 2-letter canton code (e.g., "ZH", "BE") |
| `limit` | number | No | Maximum results, 1-200 (default: 20) |

**Returns:** Station name, abbreviation, coordinates, elevation, and canton.

## meteoswissPollenData

Get current pollen concentration data from ~15 MeteoSwiss monitoring stations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `station` | string | No | Filter by station name or abbreviation |

**Returns:** Pollen types and concentration levels per station.

## search

Search MeteoSwiss website content across topics and languages (DE, FR, IT, EN).

**Returns:** Search results with titles, descriptions, and URLs.

## fetch

Fetch full content from a MeteoSwiss webpage. Converts HTML to markdown or plain text.

**Returns:** Page content in the requested format.
