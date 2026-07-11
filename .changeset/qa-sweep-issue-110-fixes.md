---
"meteoswiss-mcp": major
---

Fix nine findings from a 3-model QA sweep of v2.3.2 (issue #110):

- **BREAKING:** `fetch` no longer returns the duplicate `content` field (`text` is now the sole, canonical body field — halves payload size for every fetch call).
- **BREAKING:** `search` no longer accepts a `pageSize` parameter. The upstream Solr API silently ignores `rows` and always returns 10 results per page; the parameter gave a false impression of control. Response metadata now reports the actual delivered count instead of echoing back the (unhonored) request, and pagination offsets are fixed so `page` navigation is consistent.
- `meteoswissCurrentWeather` coordinate lookups now skip a geometrically-nearer station that lacks temperature data (e.g. Uetliberg) in favor of the nearest station that reports it (e.g. SMA/Fluntern for central Zürich).
- `meteoswissCurrentWeather("Zurich")` now resolves to SMA (Fluntern), matching how `meteoswissClimateData` already resolves "Zurich" — previously it resolved to KLO (Kloten) due to a same-city name-scoring tie-break.
- `meteoswissPollenData` now always reports all 7 species the OGD network measures, with an explicit `status: "no-current-data"` marker for any species absent from the latest reading (e.g. out of season) instead of silently omitting it. Ambrosia (ragweed) is documented in the tool description as a forecast-only category not present in this measurement feed.
- `meteoswissLocalForecast` weather icon codes 36–42 (previously "unknown") are now mapped to descriptions and SVG URLs.
- `meteoswissLocalForecast`'s tool description no longer references the invalid station abbreviation `"ZUE"` (replaced with the valid `"SMA"`).
- `meteoswissClimateData` now includes a `note` explaining the available date range and suggesting `resolution="monthly"` when a daily query's date filter returns no data, instead of a bare empty array.
- `fetch` markdown/text output no longer leaks decorative icon labels (e.g. "chevron-small-right") from MeteoSwiss's web components.
