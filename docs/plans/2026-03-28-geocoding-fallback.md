# Plan: Geocoding Fallback via geo.admin.ch

> When fuzzy station matching fails, geocode the query using swisstopo's SearchServer API, then find the nearest weather station or forecast point by distance.

## Status

- **Phase:** Draft
- **Type:** feature

## Motivation

The OGD tools accept station names, abbreviations, and postal codes. But users often ask about addresses ("Bahnhofplatz 1 Bern"), landmarks ("near the Matterhorn"), or ambiguous places. The fuzzy name matcher fails on these. The swisstopo SearchServer API can geocode any Swiss location to WGS84 coordinates for free, no auth required.

## Design

### New module: `src/support/geocode.ts`

A thin wrapper around `https://api3.geo.admin.ch/rest/services/ech/SearchServer`.

```typescript
type GeocodeResult = {
  name: string;          // label from API (HTML stripped)
  lat: number;
  lon: number;
  origin: string;        // 'address' | 'zipcode' | 'gg25' | 'gazetteer' | etc.
  rank: number;
};

async function geocodeSwissLocation(query: string): Promise<GeocodeResult | null>
```

Calls: `GET /rest/services/ech/SearchServer?searchText={query}&type=locations&sr=4326&limit=1`

Returns the top result's lat/lon, or null if no results. Strips HTML tags from labels.

### Integration into station resolvers

Both `ogd-station-resolver.ts` (forecast points) and `ogd-smn-stations.ts` (weather stations) get a geocoding fallback:

1. Try existing resolution (abbreviation → Map lookup, name → fuzzy match)
2. If no match: call `geocodeSwissLocation(query)`
3. If geocode succeeds: find nearest station/point by haversine distance
4. Return the nearest match with `confidence: 'geocoded'`

### New utility: `src/support/haversine.ts`

```typescript
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number
```

Returns distance in km. Used to find the nearest station to geocoded coordinates.

### Changes to existing tools

No schema changes. No new tools. The existing `meteoswissCurrentWeather`, `meteoswissLocalForecast`, `meteoswissClimateNormals` all benefit automatically because they use the shared resolvers.

## Branches

- `feature/geocoding-fallback` -- geocode module, haversine, resolver integration, tests

## Verification

- "Bahnhofplatz 1 Bern" resolves to BER station
- "Matterhorn" resolves to nearest station (ZER or similar)
- "8001" still works via existing postal code lookup (no regression)
- "SMA" still works via existing abbreviation lookup (no regression)
- Invalid queries like "Atlantis" still produce clear errors
