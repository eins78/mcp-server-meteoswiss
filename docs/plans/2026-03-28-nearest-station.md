# Plan: Nearest Station Lookup by Coordinates

> Accept lat/lon coordinates in weather tools and automatically find the nearest station. Enrich responses with municipality and canton from reverse geocoding.

## Status

- **Phase:** Draft
- **Type:** feature

## Motivation

AI clients often have user coordinates (device location, map selection). Currently there's no way to say "weather at 47.37, 8.54" — you need a station name. Adding coordinate input makes the tools usable for location-aware applications. The swisstopo Identify API can reverse-geocode coordinates to municipality/canton names for free.

## Design

### Schema changes

Add optional `coordinates` parameter to `meteoswissCurrentWeather` and `meteoswissLocalForecast`:

```typescript
coordinates: z.object({
  lat: z.number().min(45.5).max(48),   // Swiss lat bounds
  lon: z.number().min(5.9).max(10.6),  // Swiss lon bounds
}).optional().describe('WGS84 coordinates. Alternative to station/location name.')
```

When `coordinates` is provided, skip name resolution and find the nearest station/forecast point directly.

### Nearest-station logic

Reuse the haversine utility from the geocoding-fallback plan (or implement independently if that plan isn't merged first). Iterate over cached station metadata, compute distance, return the closest.

### Reverse geocoding enrichment

Use swisstopo Identify API to add municipality name to responses:

```
GET https://api3.geo.admin.ch/rest/services/ech/MapServer/identify
  ?geometry={lon},{lat}
  &geometryType=esriGeometryPoint
  &tolerance=0
  &sr=4326
  &layers=all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill
  &returnGeometry=false
  &limit=1
```

Response gives `gemname` (municipality), `kanton` (canton). Add to tool response as `location.municipality` and `location.canton`.

### New module: `src/support/reverse-geocode.ts`

```typescript
type ReverseGeocodeResult = {
  municipality: string;
  canton: string;
};

async function reverseGeocodeSwiss(lat: number, lon: number): Promise<ReverseGeocodeResult | null>
```

### Dependency on geocoding-fallback plan

This plan shares the haversine utility. If geocoding-fallback is implemented first, reuse it. If not, include it here.

## Branches

- `feature/nearest-station` -- coordinate parameter, nearest-station logic, reverse geocode, tests

## Verification

- `meteoswissCurrentWeather({ coordinates: { lat: 47.37, lon: 8.54 } })` returns Zurich Fluntern (SMA)
- `meteoswissLocalForecast({ coordinates: { lat: 46.95, lon: 7.45 } })` returns Bern forecast
- Response includes `location.municipality` and `location.canton`
- Coordinates outside Switzerland bounds rejected with clear error
- Existing name-based queries still work (no regression)
