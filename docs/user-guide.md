# MeteoSwiss MCP Server User Guide

This guide explains how to use the MeteoSwiss MCP server with AI assistants like Claude.

## What is MCP?

The Model Context Protocol (MCP) is a standard for enabling AI systems to access external tools and data. This server implements the MCP specification to provide weather data from MeteoSwiss to language models and other AI systems.

## Using the Hosted Service

The MeteoSwiss MCP server is hosted at `https://mchmcp.kiste.li/`. See the [installation guide](/) for setup instructions.

## Using a Local Instance

For developers running their own instance, see the [README](https://github.com/eins78/mcp-server-meteoswiss#running-your-own-instance) for setup instructions.

## Available Tools

See the [API documentation](/docs/architecture/api-design.md) for detailed tool specifications.

## Example Prompts

Once configured, you can ask Claude questions like:

- "What's the weather like in Northern Switzerland today?"
- "Get me the weather forecast for Western Switzerland in French."
- "Is it going to rain in Southern Switzerland this week?"
- "What are the temperatures going to be like in the Alps over the next few days?"

## Current Features

The server provides:

1. Weather reports for three regions of Switzerland (North, South, West)
2. Multi-language support (German, French, Italian, English)
3. Structured forecast data with daily breakdowns
4. Real-time data from MeteoSwiss API
5. HTTP/SSE transport for remote access
6. Session management and rate limiting for production use