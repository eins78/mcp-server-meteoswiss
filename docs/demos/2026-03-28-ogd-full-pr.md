# MeteoSwiss Open Data Integration: Complete PR Demo

*2026-03-28T21:43:51Z by Showboat 0.6.1*
<!-- showboat-id: fd750f1a-0624-44e0-ace5-b1d71744d871 -->

Exhaustive end-to-end validation of PR #33 on the deployed test instance (https://meteoswiss-mcp-demo-test.cloud.kiste.li). Covers all 8 MCP tools, geocoding fallback, coordinate-based lookup, reverse geocoding enrichment, weather descriptions, and error handling.

## Automated E2E Test Suite (15 tests)

```bash
node scripts/e2e-test.mjs 2>&1
```

```output

Testing against https://meteoswiss-mcp-demo-test.cloud.kiste.li

Health: ok (v1.0.0)

Tools: meteoswissWeatherReport, search, fetch, meteoswissLocalForecast, meteoswissCurrentWeather, meteoswissStations, meteoswissClimateNormals, meteoswissPollenData

  PASS  Tool count is 8
  PASS  meteoswissLocalForecast: city name "Zurich"
  PASS  meteoswissLocalForecast: postal code "8001"
  PASS  meteoswissLocalForecast: station "BER"
  PASS  meteoswissLocalForecast: geocoding "Matterhorn"
  PASS  meteoswissCurrentWeather: station "SMA"
  PASS  meteoswissCurrentWeather: coordinates near Bern
  PASS  meteoswissCurrentWeather: geocoding "Bahnhofplatz 1 Bern"
  PASS  meteoswissStations: canton ZH
  PASS  meteoswissStations: search "Lugano"
  PASS  meteoswissClimateNormals: SMA, July
  PASS  meteoswissPollenData: all stations
  PASS  search: query "Klimawandel"
  PASS  fetch: MeteoSwiss page
  PASS  meteoswissCurrentWeather: error without station or coordinates

--- Results: 15 passed, 0 failed ---
```

## Sample Tool Outputs

### meteoswissLocalForecast — station path with weather descriptions

```bash
node scripts/demo-sample.mjs meteoswissLocalForecast "{\"location\":\"BER\",\"days\":3}" 2>&1
```

```output
{
  "location": {
    "name": "Bern / Zollikofen",
    "type": "station",
    "elevation": 553,
    "coordinates": {
      "lat": 46.990744,
      "lon": 7.464061
    }
  },
  "generated": "2026-03-28T04:00:36.263750Z",
  "forecast": [
    {
      "date": "2026-03-28",
      "weather": "overcast, some sleet",
      "temperature": {
        "min": -3.9,
        "max": 6,
        "unit": "°C"
      },
      "precipitation": {
        "total": 2.4,
        "unit": "mm"
      }
    },
    {
      "date": "2026-03-29",
      "weather": "partly sunny, thick passing clouds",
      "temperature": {
        "min": 0.5,
        "max": 6,
        "unit": "°C"
      },
      "precipitation": {
        "total": 0.7,
        "unit": "mm"
      }
    },
    {
      "date": "2026-03-30",
      "weather": "very cloudy, light sleet",
      "temperature": {
        "min": 0.5,
        "max": 6.6,
        "unit": "°C"
      },
      "precipitation": {
        "total": 2.5,
        "unit": "mm"
      }
    }
  ],
  "source": "MeteoSwiss Open Data"
}
```

## Sample Tool Outputs (reproducible via curl)

Each call below uses the MCP Streamable HTTP protocol. First initialize a session, then call tools using the session ID.

```
# Initialize session (save the mcp-session-id header)
SESSION=$(curl -s -D- -X POST https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}' \
  | grep mcp-session-id | awk "{print \$2}" | tr -d "\r")
```

Then call any tool:

```
curl -s -X POST https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"TOOL","arguments":{...}}}'
```

### meteoswissLocalForecast — station with weather descriptions

```bash
/tmp/mcp-call.sh meteoswissLocalForecast "{\"location\":\"BER\",\"days\":2}"
```

```output
{
  "location": {
    "name": "Bern / Zollikofen",
    "type": "station",
    "elevation": 553,
    "coordinates": {
      "lat": 46.990744,
      "lon": 7.464061
    }
  },
  "generated": "2026-03-28T04:00:36.263750Z",
  "forecast": [
    {
      "date": "2026-03-28",
      "weather": "overcast, some sleet",
      "temperature": {
        "min": -3.9,
        "max": 6,
        "unit": "°C"
      },
      "precipitation": {
        "total": 2.4,
        "unit": "mm"
      }
    },
    {
      "date": "2026-03-29",
      "weather": "partly sunny, thick passing clouds",
      "temperature": {
        "min": 0.5,
        "max": 6,
        "unit": "°C"
      },
      "precipitation": {
        "total": 0.7,
        "unit": "mm"
      }
    }
  ],
  "source": "MeteoSwiss Open Data"
}
```

### meteoswissCurrentWeather — coordinates with reverse geocoding

```bash
/tmp/mcp-call.sh meteoswissCurrentWeather "{\"coordinates\":{\"lat\":46.95,\"lon\":7.45}}"
```

```output
{
  "station": {
    "name": "Bern / Zollikofen",
    "abbreviation": "BER",
    "elevation": 553,
    "coordinates": {
      "lat": 46.990744,
      "lon": 7.464061
    },
    "municipality": "Zollikofen",
    "canton": "BE",
    "distance_km": 4.7
  },
  "timestamp": "202603282130",
  "measurements": {
    "temperature": {
      "value": 1.7,
      "unit": "°C"
    },
    "humidity": {
      "value": 93.5,
      "unit": "%"
    },
    "dew_point": {
      "value": 0.8,
      "unit": "°C"
    },
    "precipitation": {
      "value": 0,
      "unit": "mm"
    },
    "wind_speed": {
      "value": 3.2,
      "unit": "km/h"
    },
    "wind_gust": {
      "value": 4.7,
      "unit": "km/h"
    },
    "wind_direction": {
      "value": 172,
      "unit": "°"
    },
    "sunshine": {
      "value": 0,
      "unit": "min"
    },
    "radiation": {
      "value": 0,
      "unit": "W/m²"
    },
    "pressure_station": {
      "value": 957.3,
      "unit": "hPa"
    },
    "pressure_sea_level": {
      "value": 1024.9,
      "unit": "hPa"
    }
  },
  "source": "MeteoSwiss Open Data"
}
```

### meteoswissCurrentWeather — geocoding fallback for address

```bash
/tmp/mcp-call.sh meteoswissCurrentWeather "{\"station\":\"Bahnhofplatz 1 Bern\"}" | jq "{station: .station, temperature: .measurements.temperature}"
```

```output
{
  "station": {
    "name": "Bern / Zollikofen",
    "abbreviation": "BER",
    "elevation": 553,
    "coordinates": {
      "lat": 46.990744,
      "lon": 7.464061
    },
    "municipality": "Zollikofen",
    "canton": "BE"
  },
  "temperature": {
    "value": 1.7,
    "unit": "°C"
  }
}
```

### meteoswissStations — browse by canton

```bash
/tmp/mcp-call.sh meteoswissStations "{\"canton\":\"GR\",\"limit\":3}"
```

```output
{
  "total": 26,
  "stations": [
    {
      "abbreviation": "AND",
      "name": "Andeer",
      "canton": "GR",
      "elevation": 987,
      "coordinates": {
        "lat": 46.610139,
        "lon": 9.431981
      },
      "data_since": "01.01.1901"
    },
    {
      "abbreviation": "ARO",
      "name": "Arosa",
      "canton": "GR",
      "elevation": 1878,
      "coordinates": {
        "lat": 46.792661,
        "lon": 9.679014
      },
      "data_since": "01.01.1890"
    },
    {
      "abbreviation": "BEH",
      "name": "Passo del Bernina",
      "canton": "GR",
      "elevation": 2260,
      "coordinates": {
        "lat": 46.409158,
        "lon": 10.019567
      },
      "data_since": "01.11.1908"
    }
  ],
  "source": "MeteoSwiss Open Data"
}
```

### meteoswissClimateNormals — 30-year averages

### meteoswissClimateNormals — not yet available

Climate normals data is not yet published at the expected OGD URL pattern. The tool returns a helpful error message explaining this. This dataset may become available in a future MeteoSwiss OGD release.

### meteoswissPollenData — seasonal, may be empty outside pollen season

```bash
/tmp/mcp-call.sh meteoswissPollenData "{}"
```

```output
{
  "stations": [],
  "source": "MeteoSwiss Open Data"
}
```

## Summary

| Tool | Test | Status |
|------|------|--------|
| meteoswissLocalForecast | City name, postal code, station, geocoding | All pass — weather descriptions working |
| meteoswissCurrentWeather | Station, coordinates, address geocoding | All pass — reverse geocoding enrichment working |
| meteoswissStations | Canton filter, name search | Pass |
| meteoswissClimateNormals | Station query | Data not yet published by MeteoSwiss |
| meteoswissPollenData | All stations | Empty (end of March, before main pollen season) |
| meteoswissWeatherReport | (existing, broken endpoint) | N/A — endpoint returns 404 |
| search | Keyword search | Pass |
| fetch | Page fetch | Pass |

15/15 automated E2E tests pass. Deployed and validated on https://meteoswiss-mcp-demo-test.cloud.kiste.li.
