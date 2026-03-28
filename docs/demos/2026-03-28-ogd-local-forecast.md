# getLocalForecast: Tracer Bullet Demo

*2026-03-28T17:36:11Z by Showboat 0.6.1*
<!-- showboat-id: 4da4faae-bfe4-4cfb-ae81-11bcb1930791 -->

Tracer bullet for MeteoSwiss OGD integration. Added getLocalForecast tool that fetches 9-day weather forecasts from official MeteoSwiss Open Government Data via STAC API. Covers ~6000 Swiss locations (all postal codes + weather stations + mountain POIs). Deployed to test instance at https://meteoswiss-mcp-demo-test.cloud.kiste.li

```bash
curl -s https://meteoswiss-mcp-demo-test.cloud.kiste.li/health | jq .
```

```output
{
  "status": "ok",
  "version": "1.0.0",
  "sessions": 1,
  "endpoint": "https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp"
}
```

Test instance is healthy. Now testing the getLocalForecast tool via MCP protocol.

```bash
node -e "
const { SSEClientTransport } = require(\"@modelcontextprotocol/sdk/client/sse.js\");
const { Client } = require(\"@modelcontextprotocol/sdk/client/index.js\");
async function test() {
  const t = new SSEClientTransport(new URL(\"https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp\"));
  const c = new Client({ name: \"demo\", version: \"1.0\" });
  await c.connect(t);
  const tools = await c.listTools();
  console.log(\"Available tools:\", tools.tools.map(t => t.name).join(\", \"));
  await c.close();
}
test();
"
```

```output
Available tools: meteoswissWeatherReport, search, fetch, getLocalForecast
```

getLocalForecast is registered alongside the existing tools. Now calling it with different location types.

### Test 1: City name (Zurich) — resolves via fuzzy diacritic-insensitive matching to postal code

```bash
node -e "
const { SSEClientTransport } = require(\"@modelcontextprotocol/sdk/client/sse.js\");
const { Client } = require(\"@modelcontextprotocol/sdk/client/index.js\");
async function t() {
  const tr = new SSEClientTransport(new URL(\"https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp\"));
  const c = new Client({ name: \"demo\", version: \"1.0\" });
  await c.connect(tr);
  const r = await c.callTool({ name: \"getLocalForecast\", arguments: { location: \"Zurich\", days: 3 } });
  console.log(r.content[0].text);
  await c.close();
}
t();
"
```

```output
{
  "location": {
    "name": "Zürich",
    "type": "postal_code",
    "elevation": 409,
    "coordinates": {
      "lat": 47.372289,
      "lon": 8.542189
    }
  },
  "generated": "2026-03-28T04:00:36.263750Z",
  "forecast": [
    {
      "date": "2026-03-27",
      "temperature": {
        "min": 1.4,
        "max": 2.1,
        "unit": "°C"
      },
      "precipitation": {
        "total": null,
        "unit": "mm"
      },
      "weather_icon": null
    },
    {
      "date": "2026-03-28",
      "temperature": {
        "min": -1.1,
        "max": 8.1,
        "unit": "°C"
      },
      "precipitation": {
        "total": null,
        "unit": "mm"
      },
      "weather_icon": null
    },
    {
      "date": "2026-03-29",
      "temperature": {
        "min": 1.4,
        "max": 7.1,
        "unit": "°C"
      },
      "precipitation": {
        "total": null,
        "unit": "mm"
      },
      "weather_icon": null
    }
  ],
  "source": "MeteoSwiss OGD"
}
```

### Test 2: Station abbreviation (BER) — Bern / Zollikofen, gets daily params with precipitation and weather icons

```bash
node -e "
const { SSEClientTransport } = require(\"@modelcontextprotocol/sdk/client/sse.js\");
const { Client } = require(\"@modelcontextprotocol/sdk/client/index.js\");
async function t() {
  const tr = new SSEClientTransport(new URL(\"https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp\"));
  const c = new Client({ name: \"demo\", version: \"1.0\" });
  await c.connect(tr);
  const r = await c.callTool({ name: \"getLocalForecast\", arguments: { location: \"BER\", days: 5 } });
  console.log(r.content[0].text);
  await c.close();
}
t();
"
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
      "temperature": {
        "min": -3.9,
        "max": 6,
        "unit": "°C"
      },
      "precipitation": {
        "total": 3.1,
        "unit": "mm"
      },
      "weather_icon": 10
    },
    {
      "date": "2026-03-29",
      "temperature": {
        "min": 0.3,
        "max": 6,
        "unit": "°C"
      },
      "precipitation": {
        "total": 0.3,
        "unit": "mm"
      },
      "weather_icon": 3
    },
    {
      "date": "2026-03-30",
      "temperature": {
        "min": 0.5,
        "max": 6.6,
        "unit": "°C"
      },
      "precipitation": {
        "total": 2.2,
        "unit": "mm"
      },
      "weather_icon": 15
    },
    {
      "date": "2026-03-31",
      "temperature": {
        "min": 0.6,
        "max": 6.2,
        "unit": "°C"
      },
      "precipitation": {
        "total": 2.8,
        "unit": "mm"
      },
      "weather_icon": 15
    },
    {
      "date": "2026-04-01",
      "temperature": {
        "min": 0.1,
        "max": 6.2,
        "unit": "°C"
      },
      "precipitation": {
        "total": 0.6,
        "unit": "mm"
      },
      "weather_icon": 7
    }
  ],
  "source": "MeteoSwiss OGD"
}
```

### Test 3: Postal code (6900) — Lugano, southern Switzerland

```bash
node -e "
const { SSEClientTransport } = require(\"@modelcontextprotocol/sdk/client/sse.js\");
const { Client } = require(\"@modelcontextprotocol/sdk/client/index.js\");
async function t() {
  const tr = new SSEClientTransport(new URL(\"https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp\"));
  const c = new Client({ name: \"demo\", version: \"1.0\" });
  await c.connect(tr);
  const r = await c.callTool({ name: \"getLocalForecast\", arguments: { location: \"6900\", days: 3 } });
  console.log(r.content[0].text);
  await c.close();
}
t();
"
```

```output
{
  "location": {
    "name": "Paradiso",
    "type": "postal_code",
    "elevation": 293,
    "coordinates": {
      "lat": 45.990075,
      "lon": 8.946156
    }
  },
  "generated": "2026-03-28T04:00:36.263750Z",
  "forecast": [
    {
      "date": "2026-03-27",
      "temperature": {
        "min": 8.2,
        "max": 8.5,
        "unit": "°C"
      },
      "precipitation": {
        "total": null,
        "unit": "mm"
      },
      "weather_icon": null
    },
    {
      "date": "2026-03-28",
      "temperature": {
        "min": 3.2,
        "max": 17.1,
        "unit": "°C"
      },
      "precipitation": {
        "total": null,
        "unit": "mm"
      },
      "weather_icon": null
    },
    {
      "date": "2026-03-29",
      "temperature": {
        "min": 7.8,
        "max": 16.6,
        "unit": "°C"
      },
      "precipitation": {
        "total": null,
        "unit": "mm"
      },
      "weather_icon": null
    }
  ],
  "source": "MeteoSwiss OGD"
}
```

### Test 4: Error handling — invalid location

```bash
node -e "
const { SSEClientTransport } = require(\"@modelcontextprotocol/sdk/client/sse.js\");
const { Client } = require(\"@modelcontextprotocol/sdk/client/index.js\");
async function t() {
  const tr = new SSEClientTransport(new URL(\"https://meteoswiss-mcp-demo-test.cloud.kiste.li/mcp\"));
  const c = new Client({ name: \"demo\", version: \"1.0\" });
  await c.connect(tr);
  const r = await c.callTool({ name: \"getLocalForecast\", arguments: { location: \"Atlantis\", days: 3 } });
  console.log(r.content[0].text);
  console.log(\"isError:\", r.isError);
  await c.close();
}
t();
"
```

```output
Failed to get local forecast: No forecast point found for "Atlantis". Try a Swiss postal code (e.g., "8001"), station abbreviation (e.g., "ZUE"), or place name (e.g., "Zurich").
isError: true
```

## Summary

All layers verified end-to-end on the deployed test instance:

| Test | Input | Result |
|------|-------|--------|
| City name | "Zurich" | Resolved to Zurich postal code via diacritic-insensitive fuzzy match, 3-day forecast with min/max temps |
| Station abbr | "BER" | Resolved to Bern / Zollikofen station, 5-day forecast with temps + precipitation + weather icons |
| Postal code | "6900" | Resolved to Paradiso (Lugano area), 3-day forecast. Southern Switzerland shows 17C vs 8C in the north |
| Invalid | "Atlantis" | Clear error with helpful suggestions, isError=true |

**Station path** (type 1) gets richer data: daily min/max temp, precipitation totals, and weather pictogram codes.
**Postal code path** (type 2) aggregates hourly temperature data into daily min/max (precipitation and icons not yet available for non-station points).
