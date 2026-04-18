# RC3 E2E Verification Session

**Date:** 2026-04-18  
**Model:** Claude Sonnet 4.6 (automated, worktree `meteo-rc3-e2e`)  
**Session brief:** `session-brief-serene-bengio.md`

## Summary

Ran the full 56-case E2E test suite against the TEST deployment (`meteoswiss-mcp-demo-test.cloud.kiste.li`) which confirmed `version: "2.3.0-rc.3"` at session start.

**Verdict: ❌ NO-GO** — 3 of 8 critical B2 blockers remain.

## Methodology

MCP Streamable HTTP via direct `curl` POST (session handshake + `tools/call`). The `.mcp.json` in this worktree points to PROD; tests used the TEST endpoint directly by URL.

## What Was Fixed in rc.3 ✅

- Postal code "1200" now resolves to Genève (lat 46.21°N) — was Cousset (46.82°N)
- Postal code "3000" now resolves to Bern (lat 46.97°N) — was Treyvaux (46.73°N)
- "99999" / "ABCDE" now error with helpful message instead of silently resolving
- `climateData "INVALID_STATION_XYZ"` now errors with examples
- `localForecast` field ordering now consistent across postal_code and station responses
- `fetch` metadata: `keywords` now populated, `contentType` simplified
- `search`: new pagination + sort parameters

## What Is Still Broken ❌

- `currentWeather station="Paris"` → returns Payerne (PAY). Root cause: Swiss hamlet "Paris" near Payerne (Lucens, VD) fools the geocoder despite origin restriction.
- `localForecast location="Paris"` → returns Prez-vers-Noréaz. Same root cause.
- `currentWeather station="NOTASTATION"` → still returns Chasseral (CHA). Root cause: silent fallback when all resolver strategies produce an empty candidate set.

## Additional Observation

The `fetch` tool's `url` parameter was renamed to `id` in rc.3 — a breaking schema change for existing integrations.

## Full Report

`docs/research/2026-04-18-rc3-test-report.md`
