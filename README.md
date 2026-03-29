# MeteoSwiss LLM Tools

Swiss weather data for AI assistants — powered by [MeteoSwiss Open Data](https://opendatadocs.meteoswiss.ch/).

## Packages

| Package | Description |
|---------|-------------|
| [`meteoswiss-mcp`](packages/meteoswiss-mcp/) | MCP server for MeteoSwiss weather data — forecasts, real-time measurements, stations, pollen |

## Quick Start

The MCP server is hosted and ready to use — no installation required:

```
claude mcp add meteoswiss https://meteoswiss-mcp.ars.is/mcp
```

See the [meteoswiss-mcp README](packages/meteoswiss-mcp/README.md) for Claude Desktop, Claude.ai, and self-hosting instructions.

## License

[CC0-1.0](LICENSE) — public domain
