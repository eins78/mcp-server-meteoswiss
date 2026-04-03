---
"meteoswiss-mcp": patch
---

Fix fetch tool returning empty content bodies, pollen data empty results, and forecast stale-day entries.

- **fetch:** Extract content from MeteoSwiss web component attributes (`<mch-text html="...">`) that JSDOM cannot render via shadow DOM
- **fetch:** Clarify that `id` parameter must be a full URL from search results
- **pollen:** Update data URL from `_d_now.csv` to `_d_recent.csv` after MeteoSwiss OGD rename
- **forecast:** Filter out past dates before slicing to requested days count
- **search:** Document upstream pagination overlap and date-asc sort behavior
