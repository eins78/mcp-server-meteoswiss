---
"meteoswiss-mcp": major
---

**Breaking:** `meteoswissLocalForecast`'s daily forecast shape has changed. The nested `temperature: { min, max, unit }` and `precipitation: { total, unit, hourly }` objects are removed, replaced by flat, unit-suffixed daily fields plus a unified hourly breakdown across all series (previously precipitation-only, and only for postal codes/mountain points):

- `temperature.min`/`temperature.max` → `temperature_min_c`/`temperature_max_c`
- `precipitation.total` → `precipitation_total_mm`
- `precipitation.hourly` → merged into the new `hourly` array below (alongside temperature/sunshine/wind, not precipitation-only)
- New: `sunshine_total_minutes`, `wind_avg_kmh`, `wind_gust_max_kmh`

Each day now includes `hourly: Array<{ time, temperature_c, precip_mm, sunshine_minutes, wind_kmh, wind_gust_kmh }> | null` — one unified per-hour object per series (`time` is local Europe/Zurich, DST-aware; each field is independently `null` on a per-series data gap). Weather stations now receive this hourly breakdown too (previously always `null`).

For postal codes/mountain points, every summary field is derived from the same hourly series shown alongside it. For weather stations, `temperature_min_c`/`temperature_max_c`/`precipitation_total_mm` remain MeteoSwiss's own official daily aggregates (a separately-curated product that may not exactly match summing/averaging the attached hourly series — expected, not a data error); `sunshine_total_minutes`/`wind_avg_kmh`/`wind_gust_max_kmh` have no official daily product and are always derived from the hourly series, even for stations.

Consumers parsing the old nested `temperature`/`precipitation` objects must update to the flat field names.
