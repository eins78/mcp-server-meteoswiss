# Available Tools

## meteoswissLocalForecast

Get a multi-day weather forecast for any Swiss location. Uses official MeteoSwiss Open Data — the same forecasts powering the MeteoSwiss app and website.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `location` | string | Yes | Postal code ("8001"), station abbreviation ("ZUE"), or place name ("Zurich") |
| `days` | number | No | Number of forecast days, 1-9 (default: 5) |

### Example Usage

Simply ask questions like:
- "What's the weather forecast for Zurich this week?"
- "Will it rain in Bern tomorrow?"
- "Show me the 3-day forecast for postal code 6900"

## meteoswissCurrentWeather

Get real-time weather measurements from any of ~160 Swiss automatic weather stations. Data updates every 10 minutes.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `station` | string | No | Station name ("Zurich"), abbreviation ("SMA"), or address ("Bahnhofplatz 1 Bern") |
| `coordinates` | object | No | `{ lat, lon }` in WGS84 — finds nearest station |

Provide either `station` or `coordinates` (not both).

### Example Usage

- "What's the temperature in Zurich right now?"
- "Current weather near coordinates 47.37, 8.54"
- "How windy is it at the Jungfraujoch station?"

## meteoswissStations

List and search MeteoSwiss automatic weather stations across Switzerland.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `search` | string | No | Search by station name (supports diacritics) |
| `canton` | string | No | Filter by 2-letter canton code (e.g., "ZH", "BE") |
| `limit` | number | No | Maximum results, 1-200 (default: 20) |

## meteoswissPollenData

Get current pollen concentration data from MeteoSwiss monitoring stations (~15 stations across Switzerland).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `station` | string | No | Filter by station name or abbreviation |

## search

Search MeteoSwiss website content with pagination and multi-language support (DE, FR, IT, EN).

## fetch

Fetch full content from a MeteoSwiss webpage. Can convert HTML to markdown or plain text.
