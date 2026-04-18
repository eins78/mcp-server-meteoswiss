---
"meteoswiss-mcp": patch
---

Complete B2 location-resolver fix. Non-Swiss inputs ("Paris"), invalid abbreviations ("NOTASTATION", "INVALID_STATION_XYZ"), invalid postal codes ("99999"), and gibberish ("ABCDE") now return helpful errors with examples and a pointer to `meteoswissStations`, matching the `meteoswissPollenData` reference pattern. Round-number parent postal codes ("1200" → Geneva, "3000" → Bern) resolve via a postal-code prefix fallback before geocoding. The geocoder's swisstopo query is now restricted to `zipcode`, `gg25`, `district`, and `kantone` origins for plain place-name / postal-code queries, so non-Swiss city names can no longer match arbitrary Swiss street labels.
