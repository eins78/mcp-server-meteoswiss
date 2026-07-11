---
"meteoswiss-mcp": patch
---

Functional correctness fixes from the 2026-07-11 review, all addressing cases where a tool returned confidently wrong or empty data instead of an error:

- **Measurement timestamps are now genuine ISO 8601 (FUN-3):** `meteoswissCurrentWeather` and `meteoswissPollenData` returned raw CSV cells (`202603281940` or `08.04.2026 14:30`) despite advertising ISO 8601, so an LLM could misparse the measurement time. Both fixed-width formats are now normalized to `YYYY-MM-DDTHH:mm:ssZ` (UTC).
- **Forecast day filtering uses the Europe/Zurich date (FUN-2):** the "drop past days" filter compared Zurich-bucketed forecast dates against a UTC "today", so every night between local midnight and 01:00 (winter) / 02:00 (summer) it dropped a genuinely-future day and surfaced yesterday. It now computes "today" in Europe/Zurich, matching how the days are bucketed.
- **Climate station resolution no longer accepts international city names (FUN-1):** the NBCN resolver behind `meteoswissClimateData` gained the same blocklist and geocoded-name-match guards its SMN/forecast siblings already had, so `{station: "Paris"}` now errors instead of silently returning Payerne's climate data. The shared name-match guard was de-duplicated into `name-matcher.ts` so it can't drift between the three resolvers again.
