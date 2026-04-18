---
"meteoswiss-mcp": patch
---

Fix international city false-positives in location resolvers (Paris → Payerne, etc.): add a blocklist for well-known international city names applied before geocoding. Add a post-geocoding name-match guard to reject gibberish queries (NOTASTATION → CHA) that the live swisstopo API resolves to unrelated Swiss coordinates. Revert `fetch` tool parameter rename: `id` → `url` (the rc.3 rename was unintentional and breaking for existing clients).
