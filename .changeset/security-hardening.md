---
"meteoswiss-mcp": patch
---

Security hardening from the 2026-07-11 security review, focused on the unauthenticated DoS chain and defense-in-depth:

- **Rate limiting now works behind the proxy (SEC-2):** set Express `trust proxy` (configurable via `TRUST_PROXY`, default 1 hop) so `req.ip` reflects the real client via `X-Forwarded-For` instead of collapsing every client into a single shared rate-limit bucket. A fixed hop count is used (not `trust proxy: true`) so clients cannot spoof their IP.
- **The `fetch` tool no longer blocks the event loop unboundedly (SEC-1):** removed the dead `Promise.race` "10 s timeout" (which never interrupted the synchronous JSDOM parse), added a hard 5 MB pre-parse size cap, and parse the HTML once (the text format previously instantiated a second JSDOM).
- **Outbound response bodies are now bounded in bytes and time (SEC-3):** both the HTML and CSV fetch paths stream into a capped buffer (configurable via `MAX_RESPONSE_BYTES`, default 50 MiB) and reject oversized bodies up front via `Content-Length`; the content-fetch path also regained its 30 s default timeout (previously it silently passed no timeout, leaving requests unbounded in time).
- **The `fetch` allowlist is now re-checked on redirects and pins scheme/port (SEC-4, SEC-8):** the content path follows redirects manually and re-runs the domain allowlist on every `Location` hop (an upstream open redirect can no longer escape it), and requires `https:` on the default port. Adds direct unit coverage of the allowlist rejection path, which fixture-mode integration tests never exercised (TEST-1).
- **The disk CSV cache is now bounded and traversal-safe (SEC-5):** cache keys are resolved and asserted to stay under the cache directory (a future user-derived key can no longer traverse out), orphaned `.tmp` files are swept, and the cache is pruned LRU-by-mtime once it exceeds a total-bytes ceiling (`OGD_CACHE_MAX_BYTES`, default 256 MiB).
