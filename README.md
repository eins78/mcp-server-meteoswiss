# MeteoSwiss MCP Server

A Model Context Protocol (MCP) server for MeteoSwiss weather data.

## Overview

This project implements an MCP-compliant server that provides weather data from MeteoSwiss to language models and AI tools. It allows LLMs to access current weather conditions, forecasts, weather reports, and historical meteorological data for locations across Switzerland.

## Key Features

- **Current Weather Data**: Access real-time weather conditions for any Swiss location
- **Weather Forecasts**: Get detailed forecasts up to 10 days in advance
- **Weather Reports**: Retrieve textual weather reports for different regions of Switzerland
- **Station Information**: Access data from over 150 weather stations across Switzerland
- **Historical Data**: Query historical weather measurements for various parameters
- **Multilingual Support**: Data available in all Swiss national languages (German, French, Italian) plus English

## MCP Tools

The server exposes the following MCP tools:

- `getCurrentWeather`: Get current conditions for a specific location
- `getWeatherForecast`: Get forecast for a specific location
- `findWeatherCondition`: Find locations with specific weather conditions
- `getWeatherReport`: Get detailed text-based weather report for a region
- `listWeatherStations`: Get information about MeteoSwiss weather stations
- `getStationData`: Get historical measurement data for specific stations

## Documentation

- [API Design](docs/architecture/api-design.md)
- [Data Schema](docs/analysis/data-schema.md)

## Development

### Prerequisites

- Node.js 18+
- TypeScript
- Access to MeteoSwiss data (API keys or data files)

### Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Configure environment variables
4. Start the development server: `npm run dev`

## Testing

Test fixtures containing sample MeteoSwiss data are available in the `test/__fixtures__` directory.

```
npm test
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- MeteoSwiss for providing the weather data
- Anthropic for the MCP specification
