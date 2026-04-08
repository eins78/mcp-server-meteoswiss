---
"meteoswiss-mcp": minor
---

Add Tier 1 OGD features: SMN-precip stations, climate data tool, visual observations.

- **SMN-precip**: Merge ~248 precipitation-only stations into meteoswissCurrentWeather (per-station CSV fallback)
- **meteoswissClimateData**: New tool for NBCN homogeneous climate series (29 climate + 46 precip stations, daily/monthly/yearly)
- **Visual observations**: Enrich currentWeather with cloud cover, fog, rain, snowfall, hail, snow coverage for 8 OBS stations
- **CSV parser**: Replace custom parser with csv-parse/sync library
