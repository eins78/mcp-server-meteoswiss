# 🌦️ MeteoSwiss LLM Tools

[![License: CC0-1.0](https://img.shields.io/badge/license-CC0--1.0-blue)](LICENSE)
[![npm: meteoswiss-mcp](https://img.shields.io/npm/v/meteoswiss-mcp?label=npm%3A%20meteoswiss-mcp)](https://www.npmjs.com/package/meteoswiss-mcp)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io-blue)](https://ghcr.io/eins78/meteoswiss-mcp)
[![live](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmeteoswiss-mcp.ars.is%2Fhealth&query=%24.version&label=live&color=brightgreen)](https://meteoswiss-mcp.ars.is/)
[![next](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmeteoswiss-mcp-demo-test.cloud.kiste.li%2Fhealth&query=%24.version&label=next&color=lightgrey)](https://meteoswiss-mcp-demo-test.cloud.kiste.li/)

Swiss weather data for AI assistants — powered by [MeteoSwiss Open Data](https://opendatadocs.meteoswiss.ch/), the same data behind the MeteoSwiss app and website. Free, no API key required.

**[meteoswiss-mcp.ars.is](https://meteoswiss-mcp.ars.is/)** — try the hosted service instantly, no setup needed.

- **Multi-day forecasts** for ~6000 Swiss locations (postal codes, stations, place names)
- **Real-time measurements** from ~160 automatic weather stations, updated every 10 minutes
- **Station discovery** by name, canton, or GPS coordinates
- **Pollen monitoring** from ~15 stations across Switzerland
- **MeteoSwiss website** search and content retrieval

## Choose Your Approach

This monorepo offers two ways to bring Swiss weather data into AI assistants:

| | [MCP Server](packages/meteoswiss-mcp/) | [Agent Skill](packages/meteoswiss-skills/) |
|---|---|---|
| **How it works** | Standalone server exposing structured tools via MCP | Teaches agents to call MeteoSwiss APIs directly via HTTP |
| **Best for** | Claude Desktop, Claude.ai, any MCP client | Claude Code, Cursor, agents without MCP support |
| **Features** | Fuzzy station matching, geocoding, structured JSON, prompts | Lightweight, no server process, shell scripts included |
| **Install** | One-liner or Docker | Skill package or symlink |
| **Requires** | Node.js 22+ (or Docker) | `curl`, `awk`, `jq` |

### MCP Server — Quickstart

Use the hosted instance (no installation):

```bash
# Claude Code
claude mcp add meteoswiss https://meteoswiss-mcp.ars.is/mcp
```

Or self-host with Docker:

```bash
docker run -p 3000:3000 ghcr.io/eins78/meteoswiss-mcp:latest
```

See the [meteoswiss-mcp README](packages/meteoswiss-mcp/README.md) for Claude Desktop setup, environment variables, and full documentation.

### Agent Skill — Quickstart

Install via the Claude Code plugin marketplace:

```bash
/plugin marketplace add eins78/meteoswiss-llm-tools
/plugin install meteoswiss-skills@meteoswiss-marketplace
```

Or with the [Skills CLI](https://github.com/anthropics/skills):

```bash
pnpx skills add https://github.com/eins78/meteoswiss-llm-tools.git#packages/meteoswiss-skills --global --agent claude-code --all
```

See the [meteoswiss-skills README](packages/meteoswiss-skills/README.md) for manual installation and details.

## Available Tools (MCP Server)

| Tool | Description |
|------|-------------|
| `meteoswissLocalForecast` | Multi-day forecasts by postal code, station, or place name |
| `meteoswissCurrentWeather` | Real-time measurements (temperature, wind, humidity, pressure) |
| `meteoswissStations` | Search station network by name, canton, or coordinates |
| `meteoswissPollenData` | Pollen concentration data from monitoring stations |
| `search` | Search MeteoSwiss website content (DE, FR, IT, EN) |
| `fetch` | Fetch full content from MeteoSwiss pages |

## Example Questions

Works with both approaches — just ask in any of Switzerland's four languages:

- "What's the weather forecast for Zurich this week?"
- "Wie wird das Wetter in Bern morgen?"
- "Quelle est la météo à Genève?"
- "Che tempo fa a Lugano?"

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`meteoswiss-mcp`](packages/meteoswiss-mcp/) | [![npm](https://img.shields.io/npm/v/meteoswiss-mcp)](https://www.npmjs.com/package/meteoswiss-mcp) | MCP server with structured tools, fuzzy matching, and geocoding |
| [`meteoswiss-skills`](packages/meteoswiss-skills/) | 1.0.0 | Agent skill — direct HTTP access, no server needed |

## Development

```bash
git clone https://github.com/eins78/meteoswiss-llm-tools.git
cd meteoswiss-llm-tools
nvm use && pnpm install
```

See each package's README for package-specific commands. The repo uses [changesets](https://github.com/changesets/changesets) for versioning.

## Data Source

All weather data comes from [MeteoSwiss Open Government Data (OGD)](https://opendatadocs.meteoswiss.ch/) — the official free data offering from Switzerland's Federal Office of Meteorology and Climatology. The same data powers the MeteoSwiss app and website.

## License

[CC0-1.0](LICENSE) — public domain
