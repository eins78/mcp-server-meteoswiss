# MeteoSwiss Data Schema

This document outlines the data schema for the weather information provided by the MeteoSwiss MCP server.

## Weather Data Types

### Current Weather

```typescript
interface CurrentWeather {
  location: Location;
  timestamp: string; // ISO 8601 format
  temperature: {
    value: number;
    unit: "C";
  };
  humidity: {
    value: number;
    unit: "%";
  };
  windSpeed: {
    value: number;
    unit: "km/h";
  };
  windDirection: {
    degrees: number;
    cardinal: string; // N, NE, E, SE, S, SW, W, NW
  };
  precipitation: {
    value: number;
    unit: "mm";
  };
  pressure: {
    value: number;
    unit: "hPa";
  };
  condition: {
    code: string;
    description: string;
  };
  dewPoint: {
    value: number;
    unit: "C";
  };
  uvIndex: number;
  visibility: {
    value: number;
    unit: "km";
  };
  sunriseTime: string; // ISO 8601 format
  sunsetTime: string; // ISO 8601 format
}
```

### Weather Forecast

```typescript
interface WeatherForecast {
  location: Location;
  issuedAt: string; // ISO 8601 format
  days: ForecastDay[];
}

interface ForecastDay {
  date: string; // YYYY-MM-DD
  temperatureHigh: {
    value: number;
    unit: "C";
  };
  temperatureLow: {
    value: number;
    unit: "C";
  };
  precipitationProbability: {
    value: number;
    unit: "%";
  };
  precipitationAmount: {
    value: number;
    unit: "mm";
  };
  condition: {
    code: string;
    description: string;
  };
  windSpeed: {
    value: number;
    unit: "km/h";
  };
  windDirection: {
    degrees: number;
    cardinal: string;
  };
  sunriseTime: string; // ISO 8601 format
  sunsetTime: string; // ISO 8601 format
  hourlyForecast: HourlyForecast[];
}

interface HourlyForecast {
  timestamp: string; // ISO 8601 format
  temperature: {
    value: number;
    unit: "C";
  };
  precipitation: {
    value: number;
    unit: "mm";
  };
  precipitationProbability: {
    value: number;
    unit: "%";
  };
  condition: {
    code: string;
    description: string;
  };
  windSpeed: {
    value: number;
    unit: "km/h";
  };
  windDirection: {
    degrees: number;
    cardinal: string;
  };
  humidity: {
    value: number;
    unit: "%";
  };
}
```

### Weather Report

```typescript
interface WeatherReport {
  region: {
    id: string;
    name: string;
  };
  issuedAt: string; // ISO 8601 format
  validFrom: string; // ISO 8601 format
  validTo: string; // ISO 8601 format
  language: "de" | "fr" | "it" | "en";
  summary: string;
  detailedReport: string;
  forecastDays: WeatherReportDay[];
  authorName: string;
}

interface WeatherReportDay {
  date: string; // YYYY-MM-DD
  weatherDescription: string;
  temperatureRange: string; // e.g., "10 to 15°C"
  precipitationDescription: string;
}
```

### Weather Station

```typescript
interface WeatherStation {
  id: string;
  name: string;
  location: Location;
  altitude: number;
  canton: string;
  type: "automatic" | "manual" | "partner" | "phenology" | "pollen" | "climate";
  parameters: string[]; // List of available parameters for this station
  operationalSince: string; // YYYY-MM-DD
}
```

### Station Data

```typescript
interface StationData {
  stationId: string;
  stationName: string;
  parameter: string;
  unit: string;
  timeInterval: "10min" | "hour" | "day" | "month" | "year";
  measurements: Measurement[];
}

interface Measurement {
  timestamp: string; // ISO 8601 format
  value: number | null; // null if no measurement available
  quality: "verified" | "raw" | "estimated" | "interpolated";
}
```

### Common Types

```typescript
interface Location {
  name: string;
  canton: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  altitude?: number;
}
```

## Weather Condition Codes

MeteoSwiss weather condition codes map to descriptive conditions in multiple languages:

| Code | English | German | French | Italian |
|------|---------|--------|--------|---------|
| 1    | Clear   | Klar   | Dégagé | Sereno  |
| 2    | Sunny   | Sonnig | Ensoleillé | Soleggiato |
| 3    | Partly Cloudy | Teilweise bewölkt | Partiellement nuageux | Parzialmente nuvoloso |
| 4    | Cloudy  | Bewölkt | Nuageux | Nuvoloso |
| 5    | Overcast | Bedeckt | Couvert | Coperto |
| 6    | Fog     | Nebel  | Brouillard | Nebbia |
| 7    | Light Rain | Leichter Regen | Pluie légère | Pioggia leggera |
| 8    | Rain    | Regen  | Pluie  | Pioggia |
| 9    | Heavy Rain | Starker Regen | Forte pluie | Pioggia forte |
| 10   | Light Snow | Leichter Schnee | Neige légère | Neve leggera |
| 11   | Snow    | Schnee | Neige  | Neve    |
| 12   | Heavy Snow | Starker Schnee | Neige abondante | Neve forte |
| 13   | Thunderstorm | Gewitter | Orage | Temporale |

## Parameters

Available parameters for station data:

| Parameter ID | Description | Unit |
|--------------|-------------|------|
| temperature  | Air temperature | °C |
| humidity     | Relative humidity | % |
| precipitation | Precipitation amount | mm |
| pressure-qfe | Station pressure | hPa |
| pressure-qff | Sea level pressure | hPa |
| wind         | Wind speed | km/h |
| sunshine     | Sunshine duration | min |
| globalradiation | Global radiation | W/m² |
| snow         | Snow height | cm |
| dewpoint     | Dew point | °C |
| foehn        | Foehn index | - |
| alnus        | Alder pollen | pollen/m³ |
| betula       | Birch pollen | pollen/m³ |
| poaceae      | Grass pollen | pollen/m³ |
| corylus      | Hazel pollen | pollen/m³ |
| fraxinus     | Ash pollen | pollen/m³ |
| quercus      | Oak pollen | pollen/m³ |
| fagus        | Beech pollen | pollen/m³ |
