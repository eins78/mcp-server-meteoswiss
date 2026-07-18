---
"meteoswiss-skills": patch
---

Fix forecast STAC item selection to skip items whose assets are not yet uploaded. A brand-new
daily item can exist with zero assets (observed just after midnight), and the previous
"latest by id" logic in `forecast.sh` and the SKILL.md example then returned `no_data` for
every parameter. Found by the new MCP-vs-skills eval track.
