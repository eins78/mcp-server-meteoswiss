---
"meteoswiss-mcp": patch
---

Functional correctness fixes from the 2026-07-11 review, all addressing cases where a tool returned confidently wrong or empty data instead of an error:

- **Non-retryable 4xx responses are no longer retried (FUN-8):** 404/400 etc. were retried 3× (≈3.6 s wasted latency per missing resource); the retry loop now skips 4xx except 408/429.
- **Station forecasts no longer drop all days when the `tre200dx` asset is missing (FUN-6):** the station day list derived solely from the `tre200dx` (daily max-temp) timestamps, so a run missing just that asset returned `forecast: []` even with all hourly data fetched. It now unions every daily-aggregate's dates with the hourly days, matching the non-station path.
- **Climate date filters are validated as YYYY-MM-DD (FUN-5):** `start_date`/`end_date` were plain strings compared lexicographically against `YYYY-MM-DD` row dates, so `2020-1-1`, `01.01.2020`, or `2020/01/01` were accepted and silently mis-filtered (e.g. `"2020-01-15" >= "2020-1-1"` is false). Both fields now require `^\d{4}-\d{2}-\d{2}$`.
- **Pollen tool fails loudly on a total outage (FUN-4):** when every per-station fetch failed, `meteoswissPollenData` returned `{stations: []}` as a success, which the model reported as "no pollen data available." It now throws (surfacing the underlying error) when no station yields any data.
- **Measurement timestamps are now genuine ISO 8601 (FUN-3):** `meteoswissCurrentWeather` and `meteoswissPollenData` returned raw CSV cells (`202603281940` or `08.04.2026 14:30`) despite advertising ISO 8601, so an LLM could misparse the measurement time. Both fixed-width formats are now normalized to `YYYY-MM-DDTHH:mm:ssZ` (UTC).
- **Forecast day filtering uses the Europe/Zurich date (FUN-2):** the "drop past days" filter compared Zurich-bucketed forecast dates against a UTC "today", so every night between local midnight and 01:00 (winter) / 02:00 (summer) it dropped a genuinely-future day and surfaced yesterday. It now computes "today" in Europe/Zurich, matching how the days are bucketed.
- **Climate station resolution no longer accepts international city names (FUN-1):** the NBCN resolver behind `meteoswissClimateData` gained the same blocklist and geocoded-name-match guards its SMN/forecast siblings already had, so `{station: "Paris"}` now errors instead of silently returning Payerne's climate data. The shared name-match guard was de-duplicated into `name-matcher.ts` so it can't drift between the three resolvers again.
