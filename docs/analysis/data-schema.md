# MeteoSwiss Data Schema for MCP Server

This document outlines the schema design for the MeteoSwiss data that will be exposed via the MCP server.

## Resource Types

The MCP server will expose the following main resource types:

1. **Current Weather**: Current conditions for locations
2. **Weather Forecast**: Forecasts for locations
3. **Weather Stations**: Metadata about weather stations
4. **Weather Parameters**: Information about weather measurement parameters

## Schema Definitions

### 1. Current Weather

```json
{
  "location": {
    "name": "String",         // Name of the location
    "zip": "String",          // ZIP code
    "coordinates": {
      "lat": "Number",        // Latitude
      "lon": "Number"         // Longitude
    }
  },
  "timestamp": "Number",      // UNIX timestamp of the measurement
  "measurements": {
    "temperature": {
      "value": "Number",      // Temperature value
      "unit": "String"        // Unit (e.g., "°C")
    },
    "humidity": {
      "value": "Number",      // Humidity value
      "unit": "String"        // Unit (e.g., "%")
    },
    "precipitation": {
      "value": "Number",      // Precipitation value
      "unit": "String"        // Unit (e.g., "mm")
    },
    "wind": {
      "speed": {
        "value": "Number",    // Wind speed
        "unit": "String"      // Unit (e.g., "km/h")
      },
      "direction": {
        "value": "Number",    // Wind direction in degrees
        "unit": "String"      // Unit (e.g., "°")
      }
    },
    "pressure": {
      "value": "Number",      // Pressure value
      "unit": "String"        // Unit (e.g., "hPa")
    },
    "sunshine": {
      "value": "Number",      // Sunshine duration
      "unit": "String"        // Unit (e.g., "min")
    }
  },
  "condition": {
    "id": "String",           // Weather condition ID
    "description": "String"   // Text description of the weather
  }
}
```

### 2. Weather Forecast

```json
{
  "location": {
    "name": "String",         // Name of the location
    "zip": "String",          // ZIP code
    "coordinates": {
      "lat": "Number",        // Latitude
      "lon": "Number"         // Longitude
    }
  },
  "forecasts": [
    {
      "date": "String",       // Date in YYYY-MM-DD format
      "weekday": "String",    // Day of the week
      "temperature": {
        "min": "Number",      // Minimum temperature
        "max": "Number",      // Maximum temperature
        "unit": "String"      // Unit (e.g., "°C")
      },
      "condition": {
        "id": "String",       // Weather condition ID
        "description": "String" // Text description of the weather
      },
      "precipitation": {
        "probability": "Number", // Probability of precipitation (0-100)
        "unit": "String"      // Unit (e.g., "%")
      }
    }
  ],
  "text_forecast": {
    "short": "String",        // Short forecast text
    "detailed": "String"      // Detailed forecast text
  }
}
```

### 3. Weather Stations

```json
{
  "id": "String",             // Station ID
  "name": "String",           // Station name
  "coordinates": {
    "lat": "Number",          // Latitude
    "lon": "Number",          // Longitude
    "ch": {                   // Swiss coordinate system
      "x": "Number",
      "y": "Number"
    }
  },
  "altitude": "Number",       // Altitude in meters
  "canton": "String",         // Canton code
  "measurements": [
    {
      "parameter": "String",  // Parameter ID
      "since": "Number",      // Timestamp since when data is available
      "measurement_height": "String" // Height above ground
    }
  ]
}
```

### 4. Weather Parameters

```json
{
  "id": "String",             // Parameter ID
  "name": "String",           // Parameter name
  "description": "String",    // Parameter description
  "unit": "String",           // Unit of measurement
  "sub_parameters": [
    {
      "id": "String",         // Sub-parameter ID
      "name": "String",       // Sub-parameter name
      "description": "String" // Sub-parameter description
    }
  ]
}
```

## Mapping Tables

The following mapping tables will need to be created or sourced:

### 1. Location to Station Mapping

```json
{
  "location": {
    "name": "String",         // Location name
    "zip": "String",          // ZIP code
    "coordinates": {
      "lat": "Number",        // Latitude
      "lon": "Number"         // Longitude
    }
  },
  "nearest_stations": [
    {
      "id": "String",         // Station ID
      "distance": "Number",   // Distance in kilometers
      "parameters": ["String"] // Available parameters
    }
  ]
}
```

### 2. Weather Symbol Mapping

```json
{
  "id": "String",             // Symbol ID
  "description": {
    "en": "String",           // English description
    "de": "String",           // German description
    "fr": "String",           // French description
    "it": "String"            // Italian description
  },
  "icon": "String"            // Icon reference
}
```

## Data Transformation

The raw data from MeteoSwiss will need to be transformed into the above schema. This transformation will involve:

1. Merging data from multiple sources (ChartData, StationMeta, Weather Pill)
2. Converting timestamps to standardized format
3. Applying mappings between location IDs, station IDs, and weather symbols
4. Generating text descriptions from numeric data where appropriate

## Next Steps

1. Implement the data transformation logic
2. Create or source the mapping tables
3. Design the resource fetch and update mechanisms
4. Document the API endpoints for the MCP server
