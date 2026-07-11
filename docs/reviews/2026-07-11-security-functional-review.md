# MeteoSwiss LLM Tools — Security & Functional Review

**Date:** 2026-07-11
**Reviewer:** Claude Fable (autonomous multi-agent review, delegated by Max)
**Scope:** `meteoswiss-llm-tools` monorepo — MCP server (`packages/meteoswiss-mcp`, primary security focus), skills package (`packages/meteoswiss-skills`), forecast-evals (`packages/meteoswiss-forecast-evals`), plus dependencies, Docker, and CI/CD.
**Method:** Eight parallel review agents fanned out by concern (fetch/SSRF/injection, transport/session, DoS chain, data-layer outbound HTTP, input validation, functional correctness, skills/parity/tests, supply-chain/infra), each producing structured findings with concrete triggers. Load-bearing security claims were independently re-verified against the code.

---

## Deployment context (severity is calibrated to this)

The MCP server is deployed as a **public, unauthenticated, read-only** weather proxy behind a Caddy reverse proxy. Its only outbound targets are a **hardcoded allowlist of MeteoSwiss/swisstopo government domains** (`*.admin.ch`). Every response is public data. This context deliberately deflates several findings that would be critical on an authenticated app:

- **No authentication** is a design choice for a public read-only service — documented as accepted risk, **not** a finding.
- **CORS misconfiguration** is a real footgun but has ~nil impact today (no cookies/auth/secrets to steal).
- **SSRF** is bounded by the domain allowlist; the residual gap (redirects) requires an open redirect on a government domain the attacker cannot control.

The signal-over-noise bar was set high: every finding below carries a concrete trigger or is explicitly marked unverified with severity capped.

---

## Executive summary

The codebase is **in good shape for its threat model.** The headline security controls hold: the fetch tool's domain allowlist is robust against userinfo/case/punycode/bare-path escapes; JSDOM runs with safe defaults (no script execution, no resource loading); all seven MCP tools validate inputs *and* outputs against Zod schemas; geocoder and OGD URLs are built with `URLSearchParams` (no injection); there are no committed secrets; dependency audits are clean; ReDoS and prototype-pollution sweeps came back clean; and the Docker posture is solid (non-root, multi-stage, `--ignore-scripts`).

The real risk is a **denial-of-service chain** (two HIGH links) that is fully attacker-triggerable on the unauthenticated endpoint, plus a cluster of **silently-wrong-data functional bugs** (five MEDIUM) — the worst outcome for a weather product, because the model confidently reports incorrect data instead of erroring.

### Findings by severity

| Severity | Security | Functional | Testing/Skills | Total |
|---|---|---|---|---|
| High | 2 | 0 | 0 | **2** |
| Medium | 3 | 5 | 2 | **10** |
| Low | 8 | 15 | 9 | **32** |
| Info / accepted / verified-safe | many | — | — | — |

### The two things to fix first

1. **DoS chain (HIGH):** an unauthenticated attacker can pin the single-threaded event loop with a few concurrent `fetch` calls (synchronous JSDOM parse whose "10s timeout" is dead code), and the rate limiter that should throttle this is **inert behind the proxy** (`trust proxy` never set → all clients share one bucket). See SEC-1 and SEC-2.
2. **Silently-wrong weather data (MEDIUM×5):** climate queries for "Paris" return a Swiss station's data; forecasts drop a day for 1–2 hours every night (UTC vs Zurich); timestamps violate their declared ISO-8601 contract; a total pollen outage reads as "no pollen"; and climate date filters silently mis-filter. See FUN-1 through FUN-5.

---

# SECURITY FINDINGS

## SEC-1 — [HIGH] Unauthenticated `fetch` tool blocks the event loop via synchronous JSDOM parse; the 10s timeout is dead code

- **Location:** `packages/meteoswiss-mcp/src/data/meteoswiss-content-data.ts:122-129` (dead race), `:202-280` + `:375-385` (synchronous parse)
- **Category:** Denial of service / event-loop blocking
- **Confidence:** High (independently verified)

**Description.** `fetchFromWeb` wraps HTML processing in `Promise.race([processHtmlContent(...), processingTimeout])` intending a 10-second cap. But `processHtmlContent` is a **synchronous** function (returns `ContentResponse`, no `await`): `new JSDOM(html)`, `expandWebComponents`, `extractMainContent`, and `turndownService.turndown()` all run to completion **before** `Promise.race` is even evaluated. Racing an already-resolved value against a timer does nothing — the timeout can never interrupt a parse. Node is single-threaded, so the parse blocks *every* session, health check, and SSE stream for its full duration. For `format: 'text'` the HTML is parsed by JSDOM **twice** (`extractTextContent` instantiates a second `new JSDOM`), doubling the block.

**Trigger.** `POST /mcp` invoking `fetch` with `id` = a large MeteoSwiss page (the code even warns at >500 KB but does nothing). Fire N concurrent calls — the broken rate limiter (SEC-2) does not stop this — and the CPU thread is pinned, starving all other clients.

**Impact.** Server-wide unresponsiveness from a handful of unauthenticated requests. This is the strongest, most deployment-independent security issue: it needs no attacker-controlled origin — a legitimately large government page suffices.

**Fix.** Remove the inert `Promise.race`. Bound `html.length` with a hard cap *before* parsing (reject oversized input). If a real timeout is required, move parsing to a `worker_threads` pool and race a terminable worker against a timer. Parse once — reuse the DOM for text extraction instead of re-instantiating JSDOM.

---

## SEC-2 — [HIGH] Rate limiting is inert behind the proxy (`trust proxy` never set)

- **Location:** `packages/meteoswiss-mcp/src/transports/streamable-http.ts:120-133`; no `app.set('trust proxy', …)` anywhere in `src/` (grep-confirmed)
- **Category:** Denial of service / rate-limit bypass
- **Confidence:** High (independently verified; confirmed by two agents)

**Description.** `express-rate-limit` is keyed on `req.ip` with a default of 100 req/60s. Express `trust proxy` is left at its default (off), so behind Caddy the TCP peer — and therefore `req.ip` — is **always the proxy's IP** for every client. All external clients collapse into a **single shared bucket**: one abuser exhausts 100 req/min and locks out everyone, and per-client throttling/attribution is impossible. `express-rate-limit` v8 also emits a startup validation error (`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`) in this configuration. This removes the only defense against the SEC-1 amplification.

**Trigger.** Any client behind the proxy; no auth. A single source both evades meaningful per-client limits and can DoS everyone else by consuming the shared bucket.

**Fix.** `app.set('trust proxy', 1)` (or pin to the specific Caddy hop count / subnet — **not** `trust proxy: true`, which would make `X-Forwarded-For` spoofable). Verify Caddy forwards `X-Forwarded-For` and confirm with the library's `validate` diagnostics. This also fixes useless proxy-IP-only request logging.

---

## SEC-3 — [MEDIUM] Unbounded outbound response body; content-fetch path also has no time bound

- **Location:** `packages/meteoswiss-mcp/src/support/http-communication.ts:142` (`response.text()`), `:267` (`arrayBuffer()`), `:73-77` + `:108-111` (timeout never defaulted)
- **Category:** Denial of service / unbounded memory
- **Confidence:** High that the cap is absent; medium on standalone exploitability (origin not attacker-selectable)

**Description.** Both fetch paths buffer the entire upstream body into the heap — `await response.text()` / `Buffer.from(await response.arrayBuffer())` — with no `Content-Length` check and no streaming cap. `AbortSignal.timeout` bounds *time*, not *bytes*; undici accumulates the whole body regardless. Additionally, the content-fetch path has **no time bound at all**: `fetchWithRetry` destructures only `retries`/`retryDelay`/`useCache` (never `timeout`), and `fetchHtml`→`fetchFromWeb` pass no options, so the `AbortSignal` is `undefined`. The 30s `DEFAULT_OPTIONS.timeout` is dead on this path — only `fetchBinary` (the CSV path) actually applies a timeout. So the `fetch` tool's body read is unbounded in **both time and bytes**, and a successful body is then also copied into the cache (doubling residency).

**Trigger.** `fetch` a large government page, or any oversized CSV via `fetchBinary`. Origin is host-restricted to `*.admin.ch`, so this needs a large *legitimate* gov page or a compromised/redirected upstream — hence MEDIUM. There is **no upstream mitigation**: the prod Caddy vhost sets no body limit and the prod compose service has no container memory limit (see SEC infra note), so the Node process is the only thing between a client and the buffer.

**Fix.** Check `Content-Length` and reject over a configured max before reading; better, stream via `response.body.getReader()` with a byte budget that aborts past the cap. Apply to both `fetchWithRetry` and `fetchBinary`. Restore the intended default timeout on the content path (fall back to `DEFAULT_OPTIONS.timeout` when `options.timeout` is undefined).

---

## SEC-4 — [MEDIUM, uncertain] SSRF via redirect: allowlist checked on initial URL only

- **Location:** `packages/meteoswiss-mcp/src/data/meteoswiss-content-data.ts:103-119` → `src/support/http-communication.ts:108-111`
- **Category:** SSRF
- **Confidence:** High that the gap exists; low that it is exploitable in this deployment

**Description.** `fetchFromWeb` validates `fullUrl`'s hostname against the `*.admin.ch` allowlist, then calls native `fetch()`, which defaults to `redirect: 'follow'` (undici follows up to 20 hops). Nothing re-validates intermediate or final redirect hosts. If any allowlisted government page issued a 3xx to an arbitrary host, the server would follow it and return that host's body to the caller.

**Trigger.** UNVERIFIED — contingent on an open redirect existing on a `*.admin.ch` domain, which the attacker cannot control. Hypothetically: if `https://www.meteoschweiz.admin.ch/<open-redirect>?target=http://169.254.169.254/…` existed and 302'd, `fetch({id: "<that url>"})` would return internal-metadata body text.

**Impact.** Read-only SSRF reachable from the container's network (cloud metadata, internal services), bounded by the need for a real gov-domain open redirect. Genuine defense-in-depth gap.

**Fix.** Set `redirect: 'manual'` on the content-fetch path and follow redirects yourself, re-running the allowlist check on every `Location` hop with a hop cap. While there, pin the scheme/port (see SEC-8).

**Note:** The initial-URL allowlist itself is **verified robust** — it uses `URL.hostname`, so userinfo (`@`), case, punycode/IDN, bare-path (`//evil.com`), and trailing-dot inputs all reject or anchor under the fixed host. No initial-URL escape exists.

---

## SEC-5 — [MEDIUM] Unbounded disk cache (no eviction/size cap; stale files never pruned); latent path-traversal in cache key

- **Location:** `packages/meteoswiss-mcp/src/data/ogd-data-store.ts:108-221`; dynamic keys at `ogd-local-forecast.ts:429`, `ogd-climate-data.ts:141`
- **Category:** Denial of service (disk exhaustion) + latent path traversal
- **Confidence:** High on unbounded growth; the traversal leg is latent (no current user-controlled key)

**Description.** The disk CSV cache writes to `OGD_CACHE_DIR` (default `os.tmpdir()/meteoswiss-ogd`). Freshness is TTL-tiered and checked **only on read** — an expired entry returns `null` but is **never deleted**. There is no eviction, no max entry count, no max total bytes, and no cleanup sweep. Dynamic keys (`forecasts/${item.id}/${assetKey}`, per-point/per-run) grow a permanent subdirectory tree; orphaned `.tmp` files accumulate if a process dies between write and rename. On the shared Mac-Mini Docker host this is a slow-burn disk-exhaustion vector.

Separately, `path.join(CACHE_DIR, cacheKey)` performs **no `..`/absolute-path sanitization**. Today all key components derive from server-controlled STAC metadata and validated enums (not raw user input), so it is a defense-in-depth gap, not a live exploit — it would become exploitable if any user string were ever folded into a cache key.

**Fix.** Add age-based pruning (delete files past their tier TTL) plus a total-bytes ceiling with LRU eviction; clean orphaned `.tmp` on startup. As hardening, `path.resolve` the cache path and assert it stays under `CACHE_DIR` (or hash the key).

---

## SEC-6 — [LOW] Unbounded in-memory HTTP cache and geocode cache

- **Location:** `packages/meteoswiss-mcp/src/support/http-cache.ts:17-204`; `src/support/geocode.ts:80` (`geocodeCache`)
- **Category:** Denial of service / unbounded memory growth
- **Confidence:** High

**Description.** `HttpCache` stores every fetched response in a `Map` keyed by URL, full body retained until TTL expiry, with no entry-count or byte cap (only a 5-min TTL sweep). `geocodeCache` is a `Map` keyed directly on the user's (lowercased) query — and it caches *null* misses too, so any distinct query string grows it. Both are in-memory only (no disk writes, no path-traversal). Growth is bounded by URL/query cardinality, hence LOW.

**Fix.** Add an LRU bound (max entries and/or total bytes) with eviction on insert; cap per-entry size on `HttpCache`. Bound `geocodeCache` similarly.

---

## SEC-7 — [LOW] CORS reflects arbitrary Origin *and* sets `credentials: true` (footgun)

- **Location:** `packages/meteoswiss-mcp/src/transports/streamable-http.ts:109-114`; default `CORS_ORIGIN=*` (`environment-validation.ts:80`, `docker-compose.yml`)
- **Category:** CORS misconfiguration
- **Confidence:** High

**Description.** With the shipped default `CORS_ORIGIN=*`, the code sets `origin: true`, which the `cors` package treats as **reflect the caller's `Origin`** (not literal `*`). Combined with `credentials: true`, responses echo `Access-Control-Allow-Origin: <caller>` + `Access-Control-Allow-Credentials: true` — the exact combination the CORS spec forbids for wildcards.

**Impact today: ~nil.** No cookies, no auth, no secret responses — a cross-origin page gains nothing it couldn't fetch server-side. **Why it still matters:** the day any auth/cookie/session-bound response is added, this silently becomes credential-theft-enabled with no other code change.

**Trigger.** `curl -H "Origin: https://evil.example" https://<host>/mcp -i` → response reflects the attacker origin with credentials allowed.

**Fix.** Set `credentials: false` (the server needs no credentialed cross-origin requests). If a public policy is truly intended, send a literal `origin: '*'` with `credentials: false`.

---

## SEC-8 — [LOW] `fetch.id` allowlist pins hostname but not scheme or port

- **Location:** `packages/meteoswiss-mcp/src/data/meteoswiss-content-data.ts:29-38, 96-115`
- **Category:** URL validation (SSRF hardening)
- **Confidence:** High

**Description.** The hostname allowlist is solid, but scheme is only checked via `id.startsWith('http')` and port is never checked. `https://www.meteoschweiz.admin.ch:8443/foo` and plaintext `http://…` both pass. Impact is effectively nil (can only aim at MeteoSwiss hosts) — minor port-probe/plaintext-downgrade hygiene.

**Fix.** After parsing, require `parsedUrl.protocol === 'https:'` and `parsedUrl.port === ''`. Fold into the SEC-4 redirect fix.

---

## SEC-9 — [LOW] Web-component expander builds HTML via unescaped string concatenation

- **Location:** `packages/meteoswiss-mcp/src/data/meteoswiss-web-components.ts:60-61, 80-81, 105-109, 132, 151, 165`
- **Category:** Prompt-injection / output-integrity amplification
- **Confidence:** Medium

**Description.** The expander interpolates CMS attributes directly into HTML strings (`<a href="${link.href}">${link.label}</a>`) assigned via `innerHTML`. Server-side JSDOM makes classic XSS inert, but the concatenation is unescaped: a crafted attribute could restructure the DOM (attribute-breakout) and thus the derived markdown, and `href`/`src` values (including `javascript:`/`data:` schemes) pass through Turndown into the output unchecked. Gated behind trusting the government CMS (same trust boundary as SEC-4), hence LOW.

**Fix.** If the source is ever treated as untrusted: HTML-escape interpolated text and drop non-`http(s)`/`mailto` URL schemes before building wrapper HTML.

---

## SEC-10 — [LOW] Log injection: raw user input interpolated into stderr log lines

- **Location:** `packages/meteoswiss-mcp/src/server.ts:83-84, 132, 214-216, 265-267, 305-307, 345-347, 391-393`
- **Category:** Log injection
- **Confidence:** High

**Description.** Every handler logs raw parameters via template literals (`console.error(\`… query="${params.query}" …\`)`). A `\n` in the input fabricates additional log lines (e.g. forged `[MCP Server Error]` entries) in Docker/journald; combined with the missing length caps (FUN-17), a multi-MB input lands verbatim in logs. Nuisance only — no auth/monitoring decisions are driven off these logs.

**Fix.** Truncate and JSON-stringify user strings in log lines (`JSON.stringify(params.query.slice(0, 200))`), or route through the `debug` logger (which `%O`-escapes).

---

## SEC-11 — [LOW] Session-table exhaustion by unauthenticated clients

- **Location:** `packages/meteoswiss-mcp/src/support/session-management.ts:37-52`; `src/transports/streamable-http.ts:247-261`; `MAX_SESSIONS` default 100
- **Category:** Resource exhaustion
- **Confidence:** High (mechanism); severity capped LOW by rate-limit + timeout mitigations

**Description.** Any POST without a session-id creates a transport+server pair; ~100 `initialize` POSTs fill the session table, denying new clients for up to ~5 min until idle cleanup. Bounded by rate limiting and the idle timeout. (Note: capacity failures currently surface as a generic 500, not the intended 503 — see FUN-14.)

**Fix (defense-in-depth).** Evict oldest-idle session instead of hard-rejecting; ensure `trust proxy` (SEC-2) so per-IP limits are effective.

---

## SEC-12 — [LOW] `tsx` (esbuild advisory) sits in production `dependencies`

- **Location:** `packages/meteoswiss-mcp/package.json` (`"tsx": "^4.21.0"` under `dependencies`)
- **Category:** Dependency vulnerability / hygiene
- **Confidence:** High

**Description.** `pnpm audit --prod` flags GHSA-g7r4-m6w7-qqqr (LOW, esbuild dev-server arbitrary file read on Windows) via `tsx > esbuild`. Non-exploitable at runtime (production runs `node dist/index.js` on Linux; the esbuild dev server never starts) — but `tsx` belongs in `devDependencies` (only `dev`/`parity` scripts use it), which would also shrink the prod audit surface and install footprint. A second LOW advisory (@babel/core GHSA-4x5r-pxfx-6jf8) is dev-only via the jest chain. **All production runtime deps are otherwise clean.**

**Fix.** Move `tsx` to `devDependencies`; `pnpm update @babel/core` opportunistically.

---

## SEC-13 — [LOW] `claude-code-action@beta` mutable ref with `ANTHROPIC_API_KEY` in scope

- **Location:** `.github/workflows/claude.yml:34-36`
- **Category:** CI/CD supply chain
- **Confidence:** High (facts); low likelihood of exploitation

**Description.** `uses: anthropics/claude-code-action@beta` (a mutable branch ref) receives `secrets.ANTHROPIC_API_KEY`. If the `beta` ref were compromised, the key would exfiltrate on the next `@claude` mention. Mitigations present: reputable publisher, read-only `permissions`, no `pull_request_target` anywhere, and workflows check out the default branch (no untrusted PR code executed). The release workflows are already SHA-pinned — this one is the outlier.

**Fix.** Pin to a release SHA (`anthropics/claude-code-action@<sha> # vX.Y.Z`) and let Renovate bump it, matching the release-workflow discipline. Also SHA-pin the tag-pinned `actions/checkout` in `claude.yml`/`pr-ci.yml`.

---

## Security — accepted risks, verified-safe, and info

**Accepted by design (not findings):**
- **No authentication / authorization** — deliberate for a public read-only service.
- **DNS-rebinding protection off** — targets browser access to localhost-bound private services; not applicable to this public service (and the browser cross-origin angle is covered by SEC-7).

**Prompt-injection / tool-poisoning — [LOW, inherent]:** the `fetch`/`search` tools return page text/titles to the LLM unsanitized. This is expected behavior for any fetch tool; the single content source is the trusted `*.admin.ch` CMS, so injecting hostile instructions requires influencing that CMS. Tool descriptions in `server.ts` are static string literals (no poisoning vector). No code change warranted; optionally document in the tool description that returned content is untrusted web text.

**Info-disclosure — [LOW]:** `/` and `/health` expose exact version + live session count (fingerprinting aid); `/metrics` is unauthenticated when `METRICS_ENABLED=true` (off by default); tool-error results pass upstream `error.message` to the MCP client (public data, short strings). Consider dropping version/sessions from unauthenticated responses and gating `/metrics` to the internal network if hardening.

**Infra (in the separate `~/Docker` infra repo — out of scope for this PR, flagged for Max):** no Caddy `request_body max_size`, **no container memory limit** on the prod compose service (other services in the same file have one), and `ports: "21080:3000"` publishes on all host interfaces so LAN/Tailscale clients bypass Caddy. Combined with SEC-3, Node is the only backstop against an unbounded buffer. Docker image itself is good posture; minor: base image not digest-pinned, `CMD` uses `pnpm` instead of plain `node`.

**Verified safe (documented so the effort is visible):** initial-URL domain allowlist (userinfo/case/punycode/bare-path all reject); JSDOM safe defaults (no `runScripts`, no `resources`); geocoder + all OGD download URLs (no user input reaches a URL; `URLSearchParams` throughout); fixture resolvers (traversal-safe; OGD path fails fast); no prototype-pollution vector (all indexes are `Map`s, JSON is Zod-parsed); no committed secrets ("no API keys by design" holds); all 7 tools validate inputs and outputs; static tool descriptions; no stack-trace leak over HTTP; **ReDoS sweep clean**; dependency audits clean (jsdom 24.1.3 has zero advisories).

---

# FUNCTIONAL FINDINGS

The five MEDIUM findings all share one failure mode: **the tool returns confidently wrong or empty data instead of an error** — the most damaging outcome for a weather product, because the model relays it as fact.

## FUN-1 — [MEDIUM] NBCN climate resolver missing the anti-junk guards its siblings have — "Paris" returns Swiss climate data

- **Location:** `packages/meteoswiss-mcp/src/data/ogd-nbcn-stations.ts:127-197` (`resolveNbcnStation`) vs `ogd-smn-stations.ts:203-256` and `ogd-station-resolver.ts:132-249`
- **Category:** Silent wrong data / inconsistent guard application
- **Confidence:** High

**Description.** `resolveSmnStation` and `resolveForecastPoint` both (a) reject well-known international city names via `isBlocklisted()` and (b) reject geocode hits whose returned label bears no textual resemblance to the query via `geocodedNameMatchesQuery()`. `resolveNbcnStation` (used by `meteoswissClimateData`) has **neither**, and uses a wider 80 km acceptance radius (vs 50/30). Any unmatched string goes straight to swisstopo and, if anything resolves within 80 km of an NBCN station, that station is returned.

**Trigger.** `meteoswissClimateData({station: "Paris"})` → swisstopo geocodes the hamlet Paris (Lucens VD) → nearest NBCN station (Payerne, ~3 km) → decades of climate data returned as a success. Same for gibberish that fuzzy-matches within 80 km. This is the exact failure the blocklist was introduced to prevent (its own doc comment cites the Paris/Payerne case) — fixed for two of three resolvers only.

**Fix.** Add `isBlocklisted(query.trim())` and `geocodedNameMatchesQuery(query, geocoded.name)` to `resolveNbcnStation`, mirroring `ogd-smn-stations.ts`.

---

## FUN-2 — [MEDIUM] UTC "today" filters Zurich-local forecast dates — wrong day window nightly

- **Location:** `packages/meteoswiss-mcp/src/data/ogd-local-forecast.ts:124` (`todayUtc`), used at `:246` and `:353`
- **Category:** Date/timezone logic bug
- **Confidence:** High

**Description.** Forecast days are bucketed by **Europe/Zurich** local date (`utcTimestampToZurichDate`), but the "drop past days" filter compares against `todayUtc()` (the **UTC** calendar date). Zurich is UTC+1/+2, so every night from local 00:00 until 01:00 (winter) / 02:00 (summer), `todayUtc()` still returns *yesterday's* local date.

**Trigger.** `meteoswissLocalForecast({location: "8001", days: 3})` at 00:30 local (= 22:30 UTC previous day): the filter keeps a local date that ended 30 min ago, and `.slice(0, days)` then drops the last genuinely-future day — user gets `[yesterday, today, tomorrow]` instead of `[today, tomorrow, day-after]`. The station path (`buildStationForecast`) has the same defect.

**Fix.** Compute "today" as the Europe/Zurich local date (reuse `zurichParts(now)`), not `toISOString().slice(0,10)`.

---

## FUN-3 — [MEDIUM] `timestamp` fields violate the declared "ISO 8601" contract, with two formats in one tool

- **Location:** `packages/meteoswiss-mcp/src/data/ogd-current-weather.ts:187`, `src/data/ogd-pollen-data.ts:170` vs the "ISO 8601" schema descriptions
- **Category:** API contract
- **Confidence:** High (formats verified against fixtures)

**Description.** The schemas advertise ISO 8601, but the values are raw CSV cells: the VQHA80 path returns `202603281940` (YYYYMMDDhhmm), while the precip-station fallback and pollen return `08.04.2026 14:30` (DD.MM.YYYY HH:MM). So `meteoswissCurrentWeather` returns **two different non-ISO formats** depending on the station, neither carrying timezone info — even though the visual-observations block *does* convert to `YYYY-MM-DD`, showing the intended discipline.

**Trigger.** `meteoswissCurrentWeather({station: "SMA"})` → `timestamp: "202603281940"`; a precip-only station → `timestamp: "08.04.2026 14:30"`.

**Impact.** An LLM told "ISO 8601" will misparse `202603281940` (looks like an epoch) or read `08.04.2026` with US month/day semantics — silently wrong measurement times. A `?? ''` fallback can also emit an empty timestamp.

**Fix.** Normalize both fixed-width source formats to `YYYY-MM-DDTHH:mm:ssZ` at assembly (and document the UTC basis), or correct the schema descriptions.

---

## FUN-4 — [MEDIUM] Pollen tool returns empty success when *every* station fetch fails

- **Location:** `packages/meteoswiss-mcp/src/data/ogd-pollen-data.ts:173-176, 180-182`
- **Category:** Silent failure
- **Confidence:** High

**Description.** Each per-station fetch is wrapped in `catch { return null }` (debug-logged only), then nulls are filtered out. Per-station resilience is reasonable, but there is no floor: if *all* stations fail (upstream outage, or a URL rename like the `_d_now.csv` → `_d_recent.csv` the code itself commemorates), the tool returns `{stations: [], …}` as a **success**. CLAUDE.md explicitly forbids this pattern.

**Trigger.** MeteoSwiss renames the pollen path again, or `data.geo.admin.ch` is down → every fetch throws → `stations: []` with `isError` unset → the model reports "no pollen data available" as fact.

**Fix.** Throw with the underlying error when a specific station was requested, or when `filteredStations.length > 0 && stations.length === 0`. (Same latent pattern exists for visual observations in current-weather — surface a `note` when all enrichment fails.)

---

## FUN-5 — [MEDIUM] `meteoswissClimateData` date filters accept any string and compare lexicographically → silent wrong results

- **Location:** `packages/meteoswiss-mcp/src/schemas/ogd-climate-data.ts:32-39`; `src/data/ogd-climate-data.ts:147-161`
- **Category:** Correctness (input format validation)
- **Confidence:** High

**Description.** `start_date`/`end_date` are plain `z.string()` (only a doc-comment says YYYY-MM-DD), compared lexicographically against parsed `YYYY-MM-DD` row dates. Any other format — `DD.MM.YYYY` (MeteoSwiss's own CSV format, a plausible LLM slip), `2020-1-1`, `2020/01/01` — is accepted and silently mis-filters.

**Trigger.** `meteoswissClimateData({station: "BAS", resolution: "daily", start_date: "2020-1-1", end_date: "2020-1-31"})` → `"2020-01-15" >= "2020-1-1"` is false (`"0" < "1"` at index 5) → empty `data` plus a `note` that misdiagnoses the cause as an out-of-range window.

**Fix.** `z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')` on both fields, optionally `.refine(start ≤ end)`.

---

## FUN-6 — [MEDIUM-LOW] Station forecast returns empty `forecast[]` when the `tre200dx` asset is missing — even with hourly data in hand

- **Location:** `packages/meteoswiss-mcp/src/data/ogd-local-forecast.ts:242-247, 422-426`
- **Category:** Silent failure / hidden data dependency
- **Confidence:** High on the code path; medium on trigger frequency

**Description.** For stations, the day list is derived **only** from `tre200dx` timestamps. If `findLatestAssetKey` returns null for that one param, `dates = []` and the tool returns `forecast: []` as a success — even when all five hourly series were fetched. The non-station path explicitly unions hourly + icon dates to avoid exactly this (comment at `:344-349`); the station path never got the fix.

**Fix.** Derive station dates from the union of daily-aggregate dates and `hourlyByDate.keys()`, or throw when a station has neither.

---

## FUN-7 — [LOW] HTTP conditional-revalidation (ETag/304) subsystem is unreachable dead code — and would throw if reached

- **Location:** `packages/meteoswiss-mcp/src/support/http-communication.ts:97-130`; `src/support/http-cache.ts:38-41, 102-127`
- **Category:** Dead code / broken logic
- **Confidence:** High

**Description.** `httpCache.get(url)` runs first and **deletes** any expired entry, so the later `getStaleEntry()` can never see an expired-but-revalidatable entry — `If-None-Match`/`If-Modified-Since` are never sent and `updateNotModified` never runs. Worse, if a 304 ever did arrive with no live entry, the handler falls through to `if (!response.ok)` and throws `HTTP error 304`, then retries twice. (`getCsvData` passes `useCache: false`, so this affects only `fetchJson`/`fetchHtml` consumers.)

**Fix.** Either delete the conditional-request code, or make `get()` non-destructive (separate `getFresh`/`getStale`) and handle 304 before the `response.ok` check.

---

## FUN-8 — [LOW] 4xx responses retried 3× (non-retryable)

- **Location:** `packages/meteoswiss-mcp/src/support/http-communication.ts:132-166, 259-275`
- **Category:** Weak error handling
- **Confidence:** High

**Description.** All errors are retried, including 404/400. A pollen station with no `_d_recent.csv` costs 3 extra requests + ~3.6s latency before failing; across many missing stations this compounds (they run concurrently but each is slow).

**Fix.** Skip retry when `error instanceof HttpRequestError && statusCode >= 400 && < 500` (except 408/429).

---

## FUN-9 — [LOW] Solr search response cast without validation — malformed upstream JSON becomes "0 results"

- **Location:** `packages/meteoswiss-mcp/src/data/meteoswiss-search-data.ts:146-172` (+ `fetchJson`'s `JSON.parse(text) as T`)
- **Category:** Type-safety gap / silent failure
- **Confidence:** High on the gap; medium on frequency

**Description.** STAC and swisstopo responses are Zod-validated; the Solr search response is only `as SolrResponse` with all-optional fields and `|| 0` / `|| []` fallbacks. A valid-JSON error payload or shape change yields `totalResults: 0, results: []` as a success. CLAUDE.md requires type guards for unknown external types.

**Trigger.** Upstream returns `{"error":{"code":500}}` with HTTP 200 → tool reports "no results found".

**Fix.** Zod-validate the Solr envelope (require `response.docs` to be an array) and throw on mismatch.

---

## FUN-10 — [LOW] Reverse-geocode failure cached permanently per station

- **Location:** `packages/meteoswiss-mcp/src/data/ogd-current-weather.ts:31-42`
- **Category:** Silent failure / cache poisoning
- **Confidence:** High on behavior; low on user impact

**Description.** `reverseGeocodeSwiss(...).catch(() => null)` stores `null` in `reverseGeoCache` keyed by station abbr. A single transient error permanently (until restart) suppresses `municipality` for that station. `canton` falls back to metadata so it's cosmetic — but it contradicts geocode.ts's "network errors propagate" contract.

**Fix.** Cache only successful lookups; cache `null` only for genuine "no result".

---

## FUN-11 — [LOW, uncertain] `getLatestItem` may pick a stale forecast run if the collection pages past 10 items

- **Location:** `packages/meteoswiss-mcp/src/data/ogd-stac-client.ts:84-97`
- **Category:** Possible logic bug (needs live-API verification)
- **Confidence:** Low/uncertain

**Description.** Fetches `items?limit=10` and picks the lexicographically greatest ID. The code's own comment says the API "does not reliably sort by datetime" — if ordering is unreliable *and* the collection holds >10 items, the newest run may not be in the fetched page, silently serving an older forecast. Flagged for verification against the live API, not asserted.

**Fix.** Request a sort (`sortby=-id`) if supported, page until exhaustion, or raise the limit with justification.

---

## FUN-12 — [LOW] Startup shutdown race + `stop()` never closes the HTTP listener

- **Location:** `packages/meteoswiss-mcp/src/index.ts:107-134, 158-163`; `src/transports/streamable-http.ts:341-359`
- **Category:** Race condition / dead cleanup path
- **Confidence:** High on facts; impact currently masked by `process.exit`

**Description.** `globalServer` is assigned only in `main().then(...)`, so SIGINT/SIGTERM during startup skips `stop()` (harmless — the handler then `process.exit(0)`s). More substantively, `stop()` only stops the SessionManager; the comment "Express app handles server cleanup internally" is wrong — the `Server` from `app.listen` (stashed as `app.__server`) is never `close()`d. Any future graceful-shutdown work will silently not close the listener.

**Fix.** Assign `globalServer` before awaiting `start()`; have `stop()` call `server.close()` on the stored listener.

---

## FUN-13 — [LOW] Session-capacity rejection surfaces as 500, not the intended 503

- **Location:** `packages/meteoswiss-mcp/src/transports/streamable-http.ts:250-261` + `src/support/session-management.ts:40-43`
- **Category:** Error-path mismatch
- **Confidence:** Medium-high

**Description.** The 503 "Server capacity reached" branch guards `createAndRegisterTransport`, but `sessionManager.add()` (which throws on `MAX_SESSIONS`) runs inside the `onsessioninitialized` callback during `transport.handleRequest`, whose catch returns a generic 500. The limit still holds; only the status/message and cleanup timing are off (a double `transport.close()` can also occur).

**Fix.** Check `sessionManager.size >= maxSessions` before creating the transport for an initialize request.

---

## FUN-14 — [LOW] Dead exports and stale info endpoint / doc drift

- **Location:** `packages/meteoswiss-mcp/src/support/validation-errors.ts` (whole file unused), `src/support/url-generation.ts` (`getHealthEndpointUrl` unused), `src/transports/streamable-http.ts:170-179, 199-209` (root-endpoint tool list omits `meteoswissClimateData`), `src/schemas/ogd-climate-data.ts` (`network` describe says `"climate"`/`"precipitation"` but values are `"nbcn"`/`"nbcn-precip"`)
- **Category:** Dead code / doc-contract drift
- **Confidence:** High

**Fix.** Delete dead exports; derive the `/` capability list from the registered tools (or fix both hardcoded copies); correct the `network` describe string.

---

## FUN-15 — [LOW] `{}` passes the schema for `meteoswissCurrentWeather` and `meteoswissClimateData`; both-params precedence is silent

- **Location:** `packages/meteoswiss-mcp/src/schemas/ogd-current-weather.ts:14-23`, `src/schemas/ogd-climate-data.ts:17-47`; runtime guards at the data layer
- **Category:** Schema completeness
- **Confidence:** High

**Description.** `station` and `coordinates` are both optional with no `.refine` requiring one, so `{}` validates and fails only inside the data layer (an `isError` result instead of a proper `-32602`). When both are supplied, `coordinates` silently wins — undocumented.

**Fix.** `.refine(p => p.station !== undefined || p.coordinates !== undefined, …)` and document "coordinates take precedence".

---

## FUN-16 — [LOW] No `.max()` length on any free-text string input (all 7 tools)

- **Location:** all `src/schemas/*.ts` string fields (`query`, `id`, `location`, `station`, `search`, `start_date`, `end_date`)
- **Category:** Resource abuse hygiene
- **Confidence:** High (bounded by the 10 MB body cap + rate limiting)

**Description.** Every string input is unbounded up to the 10 MB body limit. Worst amplifier: `meteoswissLocalForecast.location` — an 8 MB string gets NFD-normalized, substring-scanned against ~6000 points, sent to swisstopo, and echoed into errors/logs (compounds SEC-10).

**Fix.** `.max(200)` on `location`/`station`/`search`/`query`; `.max(2048)` on `fetch.id`; `.max(10)` on dates.

---

## FUN-17 — [LOW] `search.page` has no upper bound → arbitrary `start` offset passed upstream

- **Location:** `packages/meteoswiss-mcp/src/schemas/meteoswiss-search.ts:28-36`; used at `src/data/meteoswiss-search-data.ts:123`
- **Category:** Bounds / upstream abuse
- **Confidence:** High

**Description.** `page` is `int().positive()` (negatives correctly rejected) but has no `.max()`. `{page: 1e15}` sends `start=9999999999999990` to Solr (and crosses `Number.MAX_SAFE_INTEGER` after ×10). Deep-paging is O(start) on the remote side.

**Fix.** `.max(1000)`.

---

## FUN-18 — [LOW] `parseNumeric` accepts `Infinity`, hex, and exponent forms

- **Location:** `packages/meteoswiss-mcp/src/support/ogd-csv-parser.ts:47-51`
- **Category:** Unsafe number parsing
- **Confidence:** High on parsing; the Zod-4 downstream interaction is unverified

**Description.** `Number(value)` + `Number.isNaN` lets `Number('Infinity')`, `Number('0x1F')`, `Number('1e309')` through into measurement objects. `JSON.stringify` renders `Infinity` as `null`; depending on Zod 4's `z.number()` finiteness handling the SDK's output validation may instead reject the whole tool response. Not user-controllable (upstream CSV cells).

**Fix.** `Number.isFinite(num) ? num : null`.

---

## FUN-19 — [LOW] STAC client falls through to live network in fixture mode (violates fail-fast rule)

- **Location:** `packages/meteoswiss-mcp/src/data/ogd-stac-client.ts:46-58, 73-87`
- **Category:** Unsafe fallback / test hygiene
- **Confidence:** High

**Description.** When `USE_TEST_FIXTURES=true` and a collection ID is not in the fixture maps, the code silently proceeds to a live `fetchJson` — contradicting the fail-fast contract that `ogd-data-store.ts` enforces for CSVs. Latent today (collection IDs are constants) but would leak live traffic from CI on a future tool addition.

**Fix.** Mirror `getCsvData`: throw `No STAC fixture for collection: …` after the fixture lookup in fixture mode.

---

## FUN-20 — [LOW] `@types/jsdom@^28` vs runtime `jsdom@^24` major-version mismatch

- **Location:** `packages/meteoswiss-mcp/package.json`
- **Category:** Dependency hygiene / correctness
- **Confidence:** High

**Description.** Types describe an API four majors ahead of the runtime, so `tsc` can pass on code that misbehaves at runtime. jsdom 24.1.3 has no advisories, but is ~4 majors behind (the v29 upgrade is blocked by a Jest ESM issue — known context).

**Fix.** Pin `@types/jsdom` to `^24` until the Jest blocker is resolved, then move both to the current major together.

---

## Functional — verified clean (explicitly checked, no finding)

`haversine.ts` (formula + `findNearest` correct); `round-measurements.ts` (IEEE-754 shift + negative half-step symmetry correct); search pagination math; sort stability (stable V8 sort, consistent comparators); `groupUnifiedHourlyByDate` chronological ordering; `zurichParts` DST handling (via `Intl` `longOffset`); **ReDoS sweep** across `name-matcher`/`normalize`/`query-classifier`/`location-blocklist`/`stripHtml` (all dynamic regexes escaped, all static patterns backtracking-safe); no prototype-pollution vector; forecast-evals `ground-truth.ts` date re-bucketing and `summarize.ts` grouping.

---

# TESTING & PARITY FINDINGS

## TEST-1 — [MEDIUM] The `fetch` domain-allowlist rejection path is never tested and is unreachable in fixture mode

- **Location:** `packages/meteoswiss-mcp/src/data/meteoswiss-content-data.ts:76-110`; `test/setup.ts`; `test/integration/meteoswiss-fetch.test.ts`
- **Category:** Security-control test coverage
- **Confidence:** High

**Description.** The allowlist (`ALLOWED_DOMAINS.includes(hostname)`) lives only in `fetchFromWeb`, but `fetchMeteoSwissContent` branches to `fetchFromTestFixtures` **before** any domain validation when `USE_TEST_FIXTURES=true` — and every test runs in fixture mode. A grep for `Invalid domain|ALLOWED_DOMAINS|fetchFromWeb` across `test/` returns nothing. A refactor that breaks the allowlist ships with green CI.

**Fix.** Add a unit test calling `fetchMeteoSwissContent` with `USE_TEST_FIXTURES` unset and `id: 'https://evil.example/x'`, asserting the "Invalid domain" rejection (no network needed — rejection precedes fetch).

---

## TEST-2 — [MEDIUM] Search fixture resolver silently falls back to "first fixture in the directory" — violates the fail-fast rule

- **Location:** `packages/meteoswiss-mcp/src/data/meteoswiss-search-data.ts:260-280` vs `src/data/ogd-data-store.ts:160,202`
- **Category:** Testing anti-pattern (fixture resolver)
- **Confidence:** High

**Description.** CLAUDE.md mandates fixture resolvers fail-fast. The OGD store throws on unmapped URLs; the search path instead reads `files[0]` of the language directory and substring-filters — so a missing/renamed fixture or broken query→filename slug degrades to "whatever sorts first" (possibly 0 results) rather than failing.

**Fix.** Throw when the exact fixture is absent (mirror `ogd-data-store.ts`), or at minimum throw when the fallback yields 0 docs.

---

## TEST-3 — [LOW] `search-multiword` integration tests assert structure only — pass on zero results

- **Location:** `packages/meteoswiss-mcp/test/integration/search-multiword.test.ts:27-93`
- **Category:** Testing anti-pattern (assert content, not structure)
- **Confidence:** High

**Description.** All four tests assert only `Array.isArray(results)` and `totalResults >= 0` — true for every response including empty ones. The tests' stated purpose (multi-word query handling) is satisfied by an empty set, so a regression wouldn't be caught.

**Fix.** Assert `results.length > 0` and that `results[0]` has non-empty `title`/`url` for the fixture-backed query.

---

## TEST-4 — [LOW] Parity gate: `exceptions[].skill` target is never staleness-checked

- **Location:** `packages/meteoswiss-mcp/scripts/skills-parity-lib.ts:255-263`; `parity/parity-exceptions.yml`
- **Category:** Parity-mechanism soundness
- **Confidence:** High on the gap; low severity

**Description.** Check 5 verifies `exception.source` still exists but never probes `exception.skill` (e.g. `…/REFERENCE.md#weather-icon-codes`). Deleting that section or file leaves the lint green. **Parity is otherwise verified green** — `tool-inventory.json` byte-matches the 7 registered tools; a live `lint:parity` run passed.

**Fix.** Also `fileExists()` the file portion of `exception.skill` (strip `#anchor`), and optionally grep for the anchor heading.

---

## TEST-5 — [LOW] forecast-evals unit tests never run in CI

- **Location:** `pnpm-workspace.yaml` (package excluded); `.github/workflows/*` (no reference)
- **Category:** Test-coverage hole
- **Confidence:** High

**Description.** The package is intentionally not a workspace member, so its 40+ offline tests run only when someone remembers to `cd` in. A scorer regression lands silently.

**Fix.** Add a small CI job: `cd packages/meteoswiss-forecast-evals && pnpm install && pnpm test` (no API keys needed).

---

## TEST-6 — [LOW] Untested infrastructure paths (retry loop, disk cache)

- **Location:** `packages/meteoswiss-mcp/src/support/http-communication.ts`, `src/data/ogd-data-store.ts`
- **Category:** Test-coverage hole
- **Confidence:** High

**Description.** No unit tests for `fetchWithRetry`'s retry/backoff/304 handling or `HttpRequestError` propagation, nor for the disk cache's TTL tiers, atomic write, or corrupted-file recovery. These are the paths that matter during a MeteoSwiss outage — precisely when the server is under stress.

**Fix.** Unit-test `fetchWithRetry` against a mock `fetch` (429→retry→success, exhaustion, 304) and the data store against a temp `OGD_CACHE_DIR` (expired-TTL refetch, garbage cache file).

---

# SKILLS & EVALS FINDINGS

## SKILL-1 — [LOW] SKILL.md example uses an invalid pollen station (`pollen.sh ZUE`); station counts inconsistent

- **Location:** `packages/meteoswiss-skills/skills/meteoswiss-ogd/SKILL.md:136` (+ `:96`, `:124`); `scripts/pollen.sh:17`
- **Category:** Skill correctness / documentation
- **Confidence:** High

**Description.** The canonical example `pollen.sh ZUE # pollen data for Zurich` is wrong — Zurich's pollen station is `PZH` (confirmed in the script and Section 4). `ZUE` builds a 404 URL. Counts also disagree: SKILL.md lists 16 stations, its Error Handling says "~13", the MCP tool says "~15".

**Fix.** Change the example to `pollen.sh PZH`; reconcile the count to one number everywhere.

---

## SKILL-2 — [LOW] All 5 skill scripts share a broken help/usage exit-code idiom

- **Location:** `packages/meteoswiss-skills/skills/meteoswiss-ogd/scripts/*.sh`
- **Category:** Skill correctness / test-coverage hole
- **Confidence:** High (reproduced)

**Description.** Each script ends its usage block with `exit "${VAR:+1}"`: `--help` exits **1** (should be 0), and no-args exits **2** with `exit: : numeric argument required` on stderr. CI's "Skill Validation" checks package *structure* only — scripts are never executed or shellchecked.

**Fix.** `if [[ -z "$VAR" ]]; then exit 1; else exit 0; fi`; add a CI step running each script with `--help` (assert exit 0) plus shellcheck.

---

## SKILL-3 — [LOW] Skills `postinstall` mutates the developer's global agent config on every `pnpm install`

- **Location:** `packages/meteoswiss-skills/package.json` (`"postinstall": "skills add . --global --skill '*' --agent claude-code -y"`)
- **Category:** Hygiene / side effect
- **Confidence:** High (mechanism); severity is a policy call for Max

**Description.** As a workspace project, its `postinstall` runs on every root `pnpm install`, silently installing the skill into the user's global claude-code registry with `-y`. Anyone cloning to work on the MCP server gets it globally installed — a surprising machine-global mutation, mild supply-chain-shaped pattern.

**Fix.** Move to an explicit `pnpm run install-skill`; keep `postinstall` side-effect-free.

---

## EVAL-1 — [LOW] forecast-evals: "unavailable" fabrication check counts any digit-bearing string as a fabricated number

- **Location:** `packages/meteoswiss-forecast-evals/src/scoring-core.ts:155-160` + `coerceNumber:86-93`
- **Category:** Eval scoring correctness
- **Confidence:** High on behavior

**Description.** For `kind: "unavailable"` leaves, the scorer marks wrong if any other key coerces to a number — and `coerceNumber` extracts the first digit-run from strings. So `{"hourly_available": false, "note": "no data for 2026-04-06"}` scores as fabricated (`note` → 2026). Biases against models that annotate their declines; these gate shape decisions.

**Fix.** Restrict the fabrication scan to actual JSON numbers (or fully-numeric strings), not substring digit matches.

---

## EVAL-2 — [LOW] forecast-evals: `ms-best-walk-hour` answer coincides with the sunshine argmax

- **Location:** `packages/meteoswiss-forecast-evals/src/multiseries.ts:63-88, 143-152`
- **Category:** Eval design / discriminative power
- **Confidence:** High (recomputed by hand)

**Description.** Walk candidates tie-break to hour 12, which is also the unique sunshine max — so a model that ignores the dry/calm conditions and answers "sunniest hour" still scores correct, defeating the compound-argmax question's purpose.

**Fix.** Nudge the table so the best walk hour ≠ sunshine-max hour (e.g. give hour 12 wind 10, leaving 13 as the answer).

---

# FIX PLAN (ordered, one issue or coherent group per commit)

For a follow-up implementation session (do **not** implement in the review session). Ordered security-first, then silently-wrong-data, then hardening/cleanup, then tests/skills. Each commit is independently reviewable and testable. Run `pnpm run fix && pnpm --filter meteoswiss-mcp run ci` before each commit.

**Security — the DoS chain (highest priority):**

1. **`fix(mcp): set trust proxy so rate limiting is per-client`** — SEC-2. `app.set('trust proxy', 1)` (pin to Caddy hop); verify with express-rate-limit `validate`. Small, high value, unblocks the DoS defense.
2. **`fix(mcp): cap outbound response body size and restore content-fetch timeout`** — SEC-3. Content-Length pre-check + streamed byte budget in `fetchWithRetry`/`fetchBinary`; default `timeout` when unset. Add unit tests (covers TEST-6 partially).
3. **`fix(mcp): remove dead HTML-processing timeout and bound parse input`** — SEC-1. Delete the inert `Promise.race`; hard-cap `html.length` before `new JSDOM`; parse once (reuse DOM for text). (Worker-thread offload can be a follow-up if needed.)
4. **`fix(mcp): re-validate redirects against the domain allowlist; pin https/port`** — SEC-4 + SEC-8. `redirect: 'manual'` on the content path, per-hop allowlist check with hop cap; require `https:` and empty port.

**Security — resource bounds & hardening:**

5. **`fix(mcp): bound the disk cache (pruning + size cap) and sanitize cache-key paths`** — SEC-5.
6. **`fix(mcp): add LRU bounds to the in-memory HTTP and geocode caches`** — SEC-6.
7. **`fix(mcp): disable CORS credentials with wildcard origin`** — SEC-7.
8. **`fix(mcp): truncate/serialize user input in log lines`** — SEC-10.
9. **`chore(mcp): move tsx to devDependencies; pin claude-code-action to a SHA`** — SEC-12 + SEC-13.

**Functional — silently-wrong data (highest functional priority):**

10. **`fix(mcp): add blocklist + geocode-name guards to the NBCN climate resolver`** — FUN-1.
11. **`fix(mcp): compute forecast "today" in Europe/Zurich, not UTC`** — FUN-2.
12. **`fix(mcp): normalize measurement timestamps to ISO 8601`** — FUN-3.
13. **`fix(mcp): fail loudly when all pollen stations fail`** — FUN-4 (+ visual-observations all-fail note).
14. **`fix(mcp): validate climate date filters as YYYY-MM-DD`** — FUN-5.
15. **`fix(mcp): derive station forecast dates from daily+hourly union`** — FUN-6.

**Functional — error handling & correctness cleanup:**

16. **`fix(mcp): repair or remove the ETag/304 revalidation path`** — FUN-7.
17. **`fix(mcp): stop retrying non-retryable 4xx responses`** — FUN-8.
18. **`fix(mcp): Zod-validate the Solr search response`** — FUN-9.
19. **`fix(mcp): harden input schemas (.max lengths, page cap, require station|coordinates, parseNumeric finiteness)`** — FUN-15/16/17/18 (coherent schema-hardening group).
20. **`fix(mcp): cache only successful reverse-geocodes`** — FUN-10.
21. **`chore(mcp): remove dead code and fix info-endpoint/doc drift`** — FUN-12/13/14/19 group (validation-errors.ts, `getHealthEndpointUrl`, root tool list, climate `network` describe, STAC fixture fail-fast, `stop()` listener close, 500→503, shutdown race).
22. **`chore(mcp): pin @types/jsdom to ^24 to match runtime`** — FUN-20.
23. *(Optional, needs live-API check)* **`fix(mcp): make getLatestItem robust to unsorted/paged STAC items`** — FUN-11. Verify against the live API first.

**Testing, parity, skills, evals:**

24. **`test(mcp): cover the fetch domain-allowlist rejection path`** — TEST-1.
25. **`fix(mcp): make the search fixture resolver fail-fast; assert content in multiword tests`** — TEST-2 + TEST-3.
26. **`test(mcp): unit-test the retry loop and disk cache`** — TEST-6 (if not folded into commit 2/5).
27. **`fix(parity): staleness-check exceptions[].skill targets`** — TEST-4.
28. **`ci: run forecast-evals tests; fix fabrication check and walk-hour discriminator`** — TEST-5 + EVAL-1 + EVAL-2.
29. **`fix(skills): correct pollen example (PZH), reconcile station counts, fix script exit codes, make postinstall side-effect-free`** — SKILL-1/2/3.

**Out of scope for this repo (flag for Max — infra lives in `~/Docker`, direct-push):** add `mem_limit`/`deploy.resources.limits.memory` to the prod compose service; optional Caddy `request_body max_size`; consider not publishing `21080` on all host interfaces; digest-pin the Docker base image and switch `CMD` to plain `node`.

---

## Confidence & honesty notes

- **Independently re-verified** (not just relayed): the dead `Promise.race` timeout, the missing `trust proxy`, the default `redirect: 'follow'`, the never-defaulted content-fetch timeout, the in-memory-only HTTP/geocode caches, and `URLSearchParams` use in the geocoders.
- **Marked uncertain:** SEC-4 (needs a real gov-domain open redirect), FUN-11 (needs live-API ordering check), FUN-18's Zod-4 interaction, and the live swisstopo fuzzy-match behavior underlying FUN-1 (asserted by sibling code comments, not re-run live).
- **Deliberately deflated** to avoid inflation: no-auth (accepted), CORS (low footgun), SSRF-redirect (medium/uncertain), and the outbound-buffer DoS (medium — origin not attacker-selectable). The DoS *chain* is rated HIGH only for the two attacker-triggerable links (event-loop block + broken rate limit), which need no upstream cooperation.
