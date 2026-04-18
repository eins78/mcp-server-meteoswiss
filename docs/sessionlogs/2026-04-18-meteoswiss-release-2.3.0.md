# meteoswiss-mcp v2.3.0 — Stable Release + PROD Deploy

**Date:** 2026-04-18  
**Session type:** Release promotion (rc.4 → stable)  
**Operator:** Claude Sonnet 4.6 (automated session)

---

## What Shipped

`meteoswiss-mcp v2.3.0` stable, promoted from `v2.3.0-rc.4` after E2E verification (52/57 passes; 5 non-passes are pre-existing upstream MeteoSwiss data gaps, not code bugs — documented in rc.4 E2E report).

**Key fixes in this release (consolidated from rc.2 – rc.4):**
- International city blocklist: Paris, London, Tokyo, etc. now return a clear error instead of matching a Swiss station (e.g. Paris → Payerne)
- Post-geocoding name guard: gibberish like NOTASTATION no longer resolves to unrelated Swiss coordinates
- Non-Swiss error messages: descriptive errors with examples and pointer to `meteoswissStations`
- Postal-code prefix fallback: 1200 → Geneva, 3000 → Bern
- OBS boolean normalization: `has_rain` etc. always return `true`/`false`
- `fetch` tool: reverted unintentional breaking rename `id` → `url` from rc.3

---

## Version Bump

**Method:** Manual (changeset was `patch` type; `pnpm changeset version` would have produced `2.3.0-rc.5` not stable).

**Files changed:**
- `packages/meteoswiss-mcp/package.json`: `2.3.0-rc.4` → `2.3.0`
- `.changeset/rc4-blocklist-fixes.md`: deleted (consumed into stable release)
- `packages/meteoswiss-mcp/CHANGELOG.md`: replaced rc.2/rc.3/rc.4 sections with consolidated `## 2.3.0`

**CI gate:** `pnpm run fix && pnpm run ci` — lint and build passed. Only failure was the known macOS `port-mapping.test.ts` flake (port 3000 occupied by running local MCP server). This test passes on Linux CI.

**Commit:** `15138a4 I: Version meteoswiss-mcp v2.3.0` pushed to `main`.

---

## GitHub Release + Publishing

**Tag:** `meteoswiss-mcp-v2.3.0` (annotated)  
**GitHub Release:** https://github.com/eins78/meteoswiss-llm-tools/releases/tag/meteoswiss-mcp-v2.3.0

**Trigger:** `release.yml` fires on GitHub Release published event (NOT on tag push alone — important gotcha).

**CI run:** [#24611557235](https://github.com/eins78/meteoswiss-llm-tools/actions/runs/24611557235) — all 3 jobs passed:
- CI Validation: ✅ 52s
- Publish to npm: ✅ 22s  
- Publish to GHCR: ✅ 4m24s

**Published artifacts:**
- npm: `meteoswiss-mcp@2.3.0` (public, with provenance)
- Docker: `ghcr.io/eins78/meteoswiss-mcp:2.3.0` + `:latest` (linux/amd64, linux/arm64)

---

## PROD Deploy

**Mechanism:** `~/Docker/selfhosted/docker-compose.yaml` on mac-zrh, Caddy reverse proxy via Tailscale.

**Service:** `meteoswiss_mcp_server`, port 21080 → 3000, URL `https://meteoswiss-mcp.ars.is`

**Previous PROD version:** `2.2.1`  
**Deploy target:** `ghcr.io/eins78/meteoswiss-mcp:2.3.0`

### Deploy Gotcha: Rate Limiter + Session Reconnection Storm

The automated deploy script (`meteoswiss-deploy.sh prod 2.3.0`) **failed twice** due to rate limiting:

- The `/health` endpoint shares the global `express-rate-limit` middleware (`app.use(limiter)`, 100 req/60s)
- When the PROD container restarts, ~18 active Claude Desktop sessions immediately reconnect, flooding the server with ~5 requests each (initialize, initialized, tools/list, etc.) = ~90 requests
- This exhausts the 100/60s rate limit within seconds of startup
- The deploy script's health check (12 × 5s = 60s timeout) gets `429 Too Many Requests` instead of `{"status":"ok"}` → all 12 checks fail → auto-rollback

**First rollback side effect:** The script's `sed` rollback command was:
```bash
sed -i '' "s|${NEW_IMAGE}|${OLD_IMAGE}|"  # replaces "2.3.0" → "2.2.1" everywhere
```
This corrupted the TEST service image tag: `2.3.0-rc.4` → `2.2.1-rc.4`. The TEST **container** was unaffected (still running `2.3.0-rc.4` in memory), but the compose file was wrong. Fixed in the manual deploy step below.

### Manual Deploy (used instead of script)

Since the 2.3.0 image was confirmed healthy via manual test (`docker run --rm ghcr.io/eins78/meteoswiss-mcp:2.3.0` on port 21090 returned `{"status":"ok","version":"2.3.0"}`), the deploy was completed manually:

```bash
# Fixed both services in compose file:
# - meteoswiss_mcp_server: 2.2.1 → 2.3.0
# - meteoswiss_mcp_server_test: 2.2.1-rc.4 (corrupted) → 2.3.0-rc.4 (restored)
vim ~/Docker/selfhosted/docker-compose.yaml  # (used Edit tool)

cd ~/Docker/selfhosted && docker compose up -d meteoswiss_mcp_server
# Waited 90s for rate limit window to clear before health check
curl http://localhost:21080/health
# → {"status":"ok","version":"2.3.0","sessions":12,...}
```

**Note for future deploys:** The `meteoswiss-deploy.sh` script will fail if there are many active sessions at deploy time. Options to fix:
1. Exempt `/health` from rate limiting in the transport layer (code change needed for rc.5+)
2. Increase `RATE_LIMIT_MAX_REQUESTS` via env var in compose before deploying, then restore
3. Wait for Claude Desktop sessions to go idle (all tab/window activity quiet) before deploying

---

## Smoke Tests (PROD)

All run against `https://meteoswiss-mcp.ars.is/mcp` post-deploy.

| Test | Expected | Result |
|---|---|---|
| `initialize` | `"version":"2.3.0"` | ✅ |
| `currentWeather station="Zürich"` | Returns station data | ✅ `Zürich / Kloten`, temp + wind data |
| `currentWeather station="Paris"` | Blocklist error | ✅ `"Paris" is a well-known international city name...` |
| `localForecast location="Zürich" days=1` | Returns forecast | ✅ `{"location":{"name":"Zürich"},"forecast":[...]}` |
| `fetch url="https://www.meteoschweiz.admin.ch/..."` | Returns content | ✅ `isError: false`, content present |

---

## Final State

| Item | Value |
|---|---|
| PROD version | `2.3.0` |
| TEST version | `2.3.0-rc.4` (unchanged, as intended) |
| npm | `meteoswiss-mcp@2.3.0` |
| GHCR | `ghcr.io/eins78/meteoswiss-mcp:2.3.0` + `:latest` |
| compose file | Fixed (both services restored to correct tags) |
| Rollback target | `ghcr.io/eins78/meteoswiss-mcp:2.2.1` |
