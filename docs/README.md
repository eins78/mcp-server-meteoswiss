# MCP Server for MeteoSwiss Weather Data

This repository contains a Model Context Protocol (MCP) server for MeteoSwiss weather data. The server provides structured access to current weather observations and forecasts for Switzerland, making this data available to Large Language Models (LLMs) via the MCP protocol.

## Purpose

The MCP server enables LLMs to answer questions about:

- Current weather conditions in Swiss locations
- Weather forecasts for upcoming days
- Historical weather data and trends
- Specialized queries like "Where is it snowing?" or "What's a good place for hiking on Saturday?"

## Documentation Structure

- **[Data Analysis](analysis/data-analysis.md)**: Analysis of the available MeteoSwiss data, identifying key datasets for the MCP server
- **[Data Schema](analysis/data-schema.md)**: Schema definitions for the weather data resources
- **[Architecture](architecture/overview.md)**: Software architecture of the MCP server
- **[API Design](architecture/api-design.md)**: API design for the MCP server resources and tools

## Development

This is a work in progress. Check the individual documentation files for detailed information on each aspect of the project.
