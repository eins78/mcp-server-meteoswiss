---
"meteoswiss-skills": patch
---

Document the new hourly forecast parameters (sunshine `sre000h0`, wind speed `fu3010h0`, wind gust `fu3010h1`) alongside the existing temperature/precipitation ones, and note that every point type — including weather stations, not just postal codes/mountains — now has hourly params available. Updates `REFERENCE.md`'s parameter table, `SKILL.md`'s forecast guidance, and the bundled `forecast.sh` script's fetched parameter set, keeping this package in sync with `meteoswiss-mcp`'s hourly multi-series forecast (see that package's changeset).
