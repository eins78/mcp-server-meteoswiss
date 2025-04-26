# MeteoSwiss MCP Server

A Model Context Protocol (MCP) server for MeteoSwiss weather data.

## Overview

This project implements an MCP-compliant server that provides weather data from MeteoSwiss to language models and AI tools. It allows LLMs to access current weather conditions, forecasts, weather reports, and historical meteorological data for locations across Switzerland.

## MVP Demo

This MVP demo implements a minimal MCP server that provides access to MeteoSwiss weather reports. It uses static data files and doesn't make HTTP requests to the actual MeteoSwiss API.

### Features Implemented in MVP

- Weather reports for different regions of Switzerland (North, South, West)
- Support for multiple languages (German, French, Italian, English)
- MCP-compliant API endpoints

## Setup and Running

### Prerequisites

- Node.js v22+
- npm

### Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

### Running the Server

Build and start the server:

```bash
npm run dev
```

The server will be available at <http://localhost:3000>

## Usage Examples

### Get Available Tools

```bash
curl http://localhost:3000/api/tools
```

### Get Weather Report

```bash
curl -X POST http://localhost:3000/api/tools \
  -H "Content-Type: application/json" \
  -d '{"name":"getWeatherReport","parameters":{"region":"north","language":"en"}}'
```

## Documentation

- [User Guide](docs/user-guide.md)
- [API Design](docs/architecture/api-design.md)
- [Data Schema](docs/analysis/data-schema.md)

## Full Implementation Roadmap

The MVP is just the first step. The complete implementation will include:

- Current weather conditions
- Weather forecasts
- Station data
- Historical measurements
- Weather search capabilities

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- MeteoSwiss for providing the weather data
- Anthropic for the MCP specification
