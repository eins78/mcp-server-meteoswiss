---
"meteoswiss-mcp": patch
---

Functional correctness fixes from the 2026-07-11 review, all addressing cases where a tool returned confidently wrong or empty data instead of an error:

- **Climate station resolution no longer accepts international city names (FUN-1):** the NBCN resolver behind `meteoswissClimateData` gained the same blocklist and geocoded-name-match guards its SMN/forecast siblings already had, so `{station: "Paris"}` now errors instead of silently returning Payerne's climate data. The shared name-match guard was de-duplicated into `name-matcher.ts` so it can't drift between the three resolvers again.
