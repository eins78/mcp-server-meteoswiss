# MCP Server API Design

This document describes the API design for the MeteoSwiss MCP server, including resources and tools that will be exposed to LLM clients.

## Resources

The server will expose the following resource types:

### 1. CurrentWeather

Provides current weather conditions for a specific location.

**Path**: `/weather/current/{location}`

**Parameters**:

- `location`: Location name or ZIP code

**Example**:

```json
{
  "location": {
    "name": "Zurich",
    "zip": "8001",
    "coordinates": {
      "lat": 47.37,
      "lon": 8.54
    }
  },
  "timestamp": 1745638234350,
  "measurements": {
    "temperature": {
      "value": 15.7,
      "unit": "°C"
    },
    "humidity": {
      "value": 65,
      "unit": "%"
    },
    "precipitation": {
      "value": 0,
      "unit": "mm"
    },
    "wind": {
      "speed": {
        "value": 8,
        "unit": "km/h"
      },
      "direction": {
        "value": 270,
        "unit": "°"
      }
    },
    "pressure": {
      "value": 1015,
      "unit": "hPa"
    },
    "sunshine": {
      "value": 10,
      "unit": "min"
    }
  },
  "condition": {
    "id": "2",
    "description": "Partly cloudy"
  }
}
```

### 2. WeatherForecast

Provides weather forecast for a specific location.

**Path**: `/weather/forecast/{location}`

**Parameters**:

- `location`: Location name or ZIP code
- `days` (optional): Number of days to forecast (default: 7)

**Example**:

```json
{
  "location": {
    "name": "Zurich",
    "zip": "8001",
    "coordinates": {
      "lat": 47.37,
      "lon": 8.54
    }
  },
  "forecasts": [
    {
      "date": "2025-04-27",
      "weekday": "Sunday",
      "temperature": {
        "min": 8,
        "max": 16,
        "unit": "°C"
      },
      "condition": {
        "id": "3",
        "description": "Cloudy with some rain"
      },
      "precipitation": {
        "probability": 60,
        "unit": "%"
      }
    },
    {
      "date": "2025-04-28",
      "weekday": "Monday",
      "temperature": {
        "min": 7,
        "max": 17,
        "unit": "°C"
      },
      "condition": {
        "id": "2",
        "description": "Partly cloudy"
      },
      "precipitation": {
        "probability": 20,
        "unit": "%"
      }
    }
    // Additional days...
  ],
  "text_forecast": {
    "short": "Partly cloudy with occasional rain on Sunday, improving conditions later in the week.",
    "detailed": "A low-pressure system will bring cloudy conditions and occasional rain on Sunday. Conditions will improve on Monday with partly cloudy skies. Tuesday through Thursday will be mostly sunny with temperatures rising to 22°C by Thursday."
  }
}
```

### 3. WeatherStation

Provides metadata about a specific weather station.

**Path**: `/weather/stations/{stationId}`

**Parameters**:

- `stationId`: Weather station ID

**Example**:

```json
{
  "id": "GVE",
  "name": "Genève / Cointrin",
  "coordinates": {
    "lat": 46.25,
    "lon": 6.13,
    "ch": {
      "x": 2498904,
      "y": 1122632
    }
  },
  "altitude": 411,
  "canton": "GE",
  "measurements": [
    {
      "parameter": "temperature",
      "since": -504921600000,
      "measurement_height": "2.00 m"
    },
    {
      "parameter": "precipitation",
      "since": -631152000000,
      "measurement_height": "1.50 m"
    }
    // Additional measurements...
  ]
}
```

### 4. WeatherParameter

Provides information about a specific weather parameter.

**Path**: `/weather/parameters/{parameterId}`

**Parameters**:

- `parameterId`: Parameter ID

**Example**:

```json
{
  "id": "temperature",
  "name": "Air temperature",
  "description": "Measurement of air temperature at 2 meters above ground",
  "unit": "°C",
  "sub_parameters": [
    {
      "id": "min_temperature",
      "name": "Minimum temperature",
      "description": "Minimum temperature recorded in the past 24 hours"
    },
    {
      "id": "max_temperature",
      "name": "Maximum temperature",
      "description": "Maximum temperature recorded in the past 24 hours"
    }
  ]
}
```

## Tools

The server will expose the following tools for LLMs to use:

### 1. getCurrentWeather

Gets the current weather conditions for a specific location.

**Input**:

```json
{
  "location": "String", // Location name or ZIP code
  "language": "String"  // Language code (en, de, fr, it)
}
```

**Output**: CurrentWeather resource

### 2. getWeatherForecast

Gets the weather forecast for a specific location.

**Input**:

```json
{
  "location": "String", // Location name or ZIP code
  "days": "Number",     // Number of days to forecast
  "language": "String"  // Language code (en, de, fr, it)
}
```

**Output**: WeatherForecast resource

### 3. findWeatherCondition

Finds locations with specific weather conditions.

**Input**:

```json
{
  "condition": "String", // Weather condition (e.g., "snow", "rain", "sunny")
  "date": "String",      // Date for the condition (e.g., "today", "tomorrow", "2025-04-30")
  "language": "String"   // Language code (en, de, fr, it)
}
```

**Output**:

```json
{
  "locations": [
    {
      "name": "String",
      "condition": {
        "id": "String",
        "description": "String"
      },
      "temperature": {
        "value": "Number",
        "unit": "String"
      }
    }
  ]
}
```

### 4. getWeatherReport

Gets a textual weather report for a specific region.

**Input**:

```json
{
  "region": "String",   // Region (north, south, west)
  "language": "String"  // Language code (en, de, fr, it)
}
```

**Output**:

```json
{
  "region": "String",
  "report": {
    "current": "String",
    "forecast": "String",
    "outlook": "String"
  }
}
```

## Additional Considerations

### Error Handling

All resources and tools will return appropriate error responses when:

- The requested location or station does not exist
- The data is temporarily unavailable
- Invalid parameters are provided

### Versioning

The API will be versioned to ensure backward compatibility:

- Resources will include a `version` field
- The MCP server will support multiple concurrent versions if needed

### Rate Limiting

To prevent abuse, the server will implement rate limiting:

- Per-client rate limits
- Overall rate limits to protect the upstream MeteoSwiss APIs

### Data Freshness

All resources will include a `timestamp` field indicating when the data was last updated. Tools will always return the freshest available data.
