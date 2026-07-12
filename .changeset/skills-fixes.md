---
"meteoswiss-skills": patch
---

Skill correctness fixes from the 2026-07-11 review:

- Fix the pollen example: `pollen.sh ZUE` was an invalid station (404); Zurich's pollen station is `PZH` (SKILL-1). Reconcile the pollen station count to 16 everywhere.
- Fix a broken exit-code idiom in all five bundled scripts: `--help`/`-h` now exits 0 and a missing required argument exits 1 (previously `exit "${VAR:+1}"` made `--help` exit 1 and no-args exit 2 with a `numeric argument required` error) — SKILL-2.
- Make `pnpm install` side-effect-free: the global skill install moved from `postinstall` (which ran on every root install, mutating the developer's global agent config) to an explicit `pnpm run install-skill` (SKILL-3).
