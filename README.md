# MeteoSwiss LLM Tools

Swiss weather data for AI assistants — powered by [MeteoSwiss Open Data](https://opendatadocs.meteoswiss.ch/), the same data behind the MeteoSwiss app and website.

- **Multi-day forecasts** for ~6000 Swiss locations (postal codes, stations, place names)
- **Real-time measurements** from ~160 automatic weather stations, updated every 10 minutes
- **Station discovery** by name, canton, or GPS coordinates
- **Pollen monitoring** from ~15 stations across Switzerland
- **MeteoSwiss website** search and content retrieval

## Use the Hosted Service

No installation required — the MCP server is hosted at `https://meteoswiss-mcp.ars.is`.

### Claude Code

```bash
claude mcp add meteoswiss https://meteoswiss-mcp.ars.is/mcp
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "meteoswiss": {
      "command": "npx",
      "args": ["mcp-remote", "https://meteoswiss-mcp.ars.is/mcp"]
    }
  }
}
```

### Docker

```bash
docker run -p 3000:3000 ghcr.io/eins78/meteoswiss-mcp:latest
```

## Available Tools

| Tool | Description |
|------|-------------|
| `meteoswissLocalForecast` | Multi-day forecasts by postal code, station, or place name |
| `meteoswissCurrentWeather` | Real-time measurements (temperature, wind, humidity, pressure) |
| `meteoswissStations` | Search station network by name, canton, or coordinates |
| `meteoswissPollenData` | Pollen concentration data from monitoring stations |
| `search` | Search MeteoSwiss website content (DE, FR, IT, EN) |
| `fetch` | Fetch full content from MeteoSwiss pages |

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`meteoswiss-mcp`](packages/meteoswiss-mcp/) | [![npm](https://img.shields.io/npm/v/meteoswiss-mcp)](https://www.npmjs.com/package/meteoswiss-mcp) | MCP server for MeteoSwiss weather data |
| [`meteoswiss-skills`](packages/meteoswiss-skills/) | 1.0.0-rc.1 | Agent skill for direct MeteoSwiss Open Data access (no MCP server needed) |

See the [meteoswiss-mcp README](packages/meteoswiss-mcp/README.md) for full documentation, self-hosting, environment variables, and development setup.

## License

[CC0-1.0](LICENSE) — public domain
