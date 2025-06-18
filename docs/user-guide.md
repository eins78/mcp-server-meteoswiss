# MeteoSwiss MCP Server User Guide

This guide explains how to use the MeteoSwiss MCP server with AI assistants like Claude.

## What is MCP?

The Model Context Protocol (MCP) is a standard for enabling AI systems to access external tools and data. This server implements the MCP specification to provide weather data from MeteoSwiss to language models and other AI systems.

## Using the Hosted Service

The MeteoSwiss MCP server is hosted at `https://meteoswiss-mcp-demo.cloud.kiste.li/`. See the [installation guide](/) for setup instructions.

## Using a Local Instance

For developers running their own instance, see the [README](https://github.com/eins78/mcp-server-meteoswiss#running-your-own-instance) for setup instructions.

## Available Tools

See the [API documentation](/docs/architecture/api-design.md) for detailed tool specifications.

## Example Prompts

Once configured, you can ask Claude questions like:

### Weather Reports
- "What's the weather like in Northern Switzerland today?"
- "Get me the weather forecast for Western Switzerland in French."
- "Is it going to rain in Southern Switzerland this week?"
- "What are the temperatures going to be like in the Alps over the next few days?"

### Content Search
- "Search for information about climate change on MeteoSwiss"
- "Find MeteoSwiss articles about thunderstorms in German"
- "Look for measurement station information on the MeteoSwiss website"

### Content Retrieval
- "Get the full content of the MeteoSwiss page about wind warnings"
- "Fetch the article about precipitation measurement in markdown format"
- "Show me the MeteoSwiss page on seasonal forecasts"

## Current Features

The server provides:

1. **Weather Reports** - Detailed reports for three regions of Switzerland (North, South, West)
2. **Content Search** - Full-text search across MeteoSwiss website content
3. **Content Fetch** - Retrieve and convert web pages to different formats
4. **Multi-language Support** - German, French, Italian, English
5. **Structured Data** - JSON responses with metadata and formatting
6. **Intelligent Caching** - HTTP caching with ETag support for performance
7. **Real-time Data** - Live data from MeteoSwiss APIs
8. **HTTP/SSE Transport** - Remote access via standard web protocols
9. **Session Management** - Production-ready with rate limiting
