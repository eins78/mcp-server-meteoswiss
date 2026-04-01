# MeteoSwiss Skills

Agent skill that teaches AI agents to access [MeteoSwiss Open Government Data](https://opendatadocs.meteoswiss.ch/) directly via HTTP — no MCP server or API key required.

Part of the [meteoswiss-llm-tools](../../README.md) monorepo. For a richer experience with structured JSON and fuzzy matching, see the [MCP server](../meteoswiss-mcp/) or try it at **[meteoswiss-mcp.ars.is](https://meteoswiss-mcp.ars.is/)**.

## Skills

| Skill | Description |
|-------|-------------|
| [`meteoswiss-ogd`](skills/meteoswiss-ogd/) | Access Swiss weather data (current conditions, forecasts, pollen) via curl/HTTP |

## Installation

### Claude Code Plugin Marketplace

```bash
/plugin marketplace add eins78/meteoswiss-llm-tools
/plugin install meteoswiss-skills@meteoswiss-marketplace
```

### Skills CLI

```bash
pnpx skills add https://github.com/eins78/meteoswiss-llm-tools.git#packages/meteoswiss-skills --global --agent claude-code --all
```

### Manual

```bash
ln -s /path/to/packages/meteoswiss-skills/skills/meteoswiss-ogd ~/.claude/skills/meteoswiss-ogd
```

## Relationship to MCP Server

The [`meteoswiss-mcp`](../meteoswiss-mcp/) package in this monorepo provides a full MCP server with structured JSON responses, fuzzy station matching, and geocoding. This skill is for agents that don't have the MCP server available — it teaches them to call the same underlying data sources directly.

## Development

```bash
pnpm test        # Validate skills with: skills add . --list
```

## License

[CC0-1.0](../../LICENSE) — public domain
