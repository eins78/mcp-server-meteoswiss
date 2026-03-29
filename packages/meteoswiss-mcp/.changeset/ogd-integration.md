---
"mcp-server-meteoswiss": major
---

Add MeteoSwiss Open Data integration with 4 new tools

- **meteoswissLocalForecast**: 9-day weather forecasts for any Swiss location (~6000 points). Uses official MeteoSwiss Open Data — the same forecasts powering the MeteoSwiss app and website.
- **meteoswissCurrentWeather**: Real-time measurements from ~160 automatic weather stations. Updated every 10 minutes. Supports station names, addresses (via swisstopo geocoding), and WGS84 coordinates.
- **meteoswissStations**: Search and browse the SwissMetNet station network by name, canton, or elevation.
- **meteoswissPollenData**: Pollen concentration data from ~15 monitoring stations across Switzerland.

Shared infrastructure: STAC API client, disk-based CSV cache, fuzzy station resolver with diacritics support, swisstopo geocoding/reverse geocoding, weather icon descriptions.
