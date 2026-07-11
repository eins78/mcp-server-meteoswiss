---
"meteoswiss-skills": minor
---

Add climate data (NBCN) coverage to the `meteoswiss-ogd` skill: a new "Get Climate Data" section in SKILL.md with a live-verified curl workflow for the homogeneous climate series (yearly/monthly/daily), a Climate Parameters table in REFERENCE.md, and the `ch.meteoschweiz.ogd-nbcn-precip` collection in the STAC table. Closes the long-standing gap where the MCP server's `meteoswissClimateData` tool had no skill counterpart — the first gap caught (deliberately, red-first) by the new skills↔MCP parity lint.
