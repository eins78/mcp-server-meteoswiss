---
"meteoswiss-mcp": minor
---

Add hourly precipitation breakdown to `meteoswissLocalForecast`. Each day's `precipitation` object now includes `hourly: Array<{ time, value }> | null` — per-hour mm readings in local Europe/Zurich time (DST-aware), letting consumers judge *when* rain is expected rather than only the daily total. Available for postal codes and mountain points; `null` for weather stations (not yet fetched for that point type).
