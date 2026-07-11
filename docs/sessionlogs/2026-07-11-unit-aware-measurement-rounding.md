# Unit-Aware Measurement Rounding

**Date:** 2026-07-09 to 2026-07-11
**Model:** Claude Opus 4.8 (worktree `mcp-numeric-rounding`, branch `feature/unit-aware-rounding`)
**PR:** [#111](https://github.com/eins78/meteoswiss-llm-tools/pull/111) — merged as `1f13610`

## Motivation

MeteoSwiss OGD CSVs carry raw measurement precision (temperatures like `12.34567°C`, wind
`8.42 km/h`) straight through to MCP tool output. Max wanted every numeric value rounded for
display, precision keyed to unit — wind and temperature to 1 decimal place, with the rest of
the table left to propose-and-confirm.

## Design decision: assembly-time rounding, not serialization-boundary mutation

The first implementation applied rounding as a single recursive tree-walk
(`roundMeasurementOutput`) wrapped around `JSON.stringify` at all 7 tool call sites in
`server.ts` — a plausible design since every tool serializes identically at that one chokepoint.

Max's review rejected this: values should be correct **where the response is assembled**, not
mutated after the fact at output time. He suspected the boundary approach was chosen only
because the code passes OGD data through rather than assembling it — worth checking rather than
assuming.

Traced every numeric field's construction across the 5 data-layer files to test that premise.
Finding: **everything is genuinely assembled**, nothing is opaque pass-through. Every value goes
through `parseNumeric(row[key])` and is explicitly placed into a typed response object by our
own code — some via direct copies, some computed (`Math.min`/`Math.max`/`reduce` over hourly
arrays). `ogd-current-weather.ts` even funnels all 12 unit-tagged fields through one shared
`measurement()` helper. So there was no "shorter way" needed — just move the rounding call to
each of the ~6 real construction sites and delete the tree-walk. Reworked accordingly; `roundOptional`/
`roundNullable`/`roundByUnit` became the shared primitives, called directly at each assembly point.

## Copilot review loop found two real bugs

Ran an iterative loop (fix → push → wait for Copilot re-review → repeat) rather than a single
pass. Two rounds surfaced genuine correctness issues in `roundByUnit`, not just style nits:

1. **IEEE-754 half-step artifact**: `Math.round(value * 10**decimals) / factor` floors values
   like `0.15` to `0.1` instead of `0.2`, because `0.15 * 10 === 1.4999999999999998` in floating
   point. Fixed by shifting the decimal point through string/exponential notation
   (`Number('0.15e1') === 1.5` exactly) instead of multiplying.
2. **Asymmetric negative rounding**: `Math.round(-23.5) === -23` in JS (ties round toward
   +Infinity), so `-2.35°C` would round to `-2.3` while `2.35°C` rounds to `2.4` — a real bug for
   signed temperature data. Fixed by rounding the absolute value and restoring sign.
3. Also caught: missing `Number.isFinite` guard (only checked `NaN`, so `Infinity`/`-Infinity`
   from `parseNumeric`'s `Number()` coercion would corrupt via `Number('Infinitye1') === NaN`).

Several Copilot comments on later rounds were **stale carryovers** of already-fixed issues
(GitHub keeps showing old review comments against the current commit until the diff context
moves enough) — verified each by reading current code before acting, rather than reacting to
every comment mention.

## Merge-policy churn, then a real conflict

Max iterated on the merge instructions live (rebase-merge → corrected to merge-commit, with a
garbled message in between that had visible text-substitution corruption — flagged and asked
for the clean version rather than guessing at a destructive git operation from corrupted text).
Final policy: manually clean history via interactive rebase (fold review-fix commits into a few
meaningful standalone commits), force-push, then merge with `--merge` (never squash, never
rebase-merge).

History was reorganized from 6 chronological commits (including one whole approach that was
later reverted) into 3: the rounding utility + its tests, wiring into the 4 data-layer assembly
points + integration tests, and the changeset. Verified the reorganized tree was byte-identical
to the Copilot-approved state before pushing.

That rebase then hit a **real conflict**: a concurrent QA-sweep PR (#116, merged to `main` mid-session)
touched the exact same files — `ogd-current-weather.ts`, `ogd-climate-data.ts`,
`ogd-pollen-data.ts`, `server.ts` — plus two fixture CSVs our rounding tests were pinned against.
Rebasing onto the new `main` surfaced one textual conflict (pollen's new `status: 'measured'`
field vs. our `roundByUnit` call) and one semantic break (a new test asserting
`Number.isInteger` over *all* pollen entries, which failed against QA-sweep's new
`status: 'no-current-data'` placeholder entries that carry no `value`). Fixed both, re-ran full
CI, folded the fix into the commit it belonged to via `git commit --fixup` + `rebase -i --autosquash`
rather than leaving it as trailing churn.

Also hit unrelated worktree noise mid-rebase: this worktree has `node_modules` and
`.claude/settings.local.json` committed with real modifications on disk that diverge from git's
tracked snapshot (pre-existing, unrelated to this task). A whole-tree `git stash` to clear the
noise for the rebase transiently broke the build (`tsc` couldn't find `@types/jsdom` — the stash
had reverted the real on-disk package to a stale committed snapshot). Restored via
`git stash apply <sha>` (never bare `pop`, per shared-stash safety with concurrent sessions) and
re-verified CI before proceeding.

## Outcome

Merged as `1f13610` (real merge commit, 3 clean commits). Per-unit table: `°C`/`km/h`/`m/s`/`mm`
→ 1dp; `°` (wind bearing, deliberately distinct from wind *speed*)/`%`/`hPa`/`min`/`W/m²`/`cm`/
`particles/m³` → 0dp. Coordinates, elevation, `distance_km`, climate day-counts, and all
IDs/timestamps/counts are excluded by construction (never routed through the rounding helpers).
`meteoswissStations` output is untouched — its only numerics are all excluded fields.
