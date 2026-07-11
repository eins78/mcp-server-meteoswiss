---
"meteoswiss-mcp": patch
---

Security hardening from the 2026-07-11 security review, focused on the unauthenticated DoS chain and defense-in-depth:

- **Rate limiting now works behind the proxy (SEC-2):** set Express `trust proxy` (configurable via `TRUST_PROXY`, default 1 hop) so `req.ip` reflects the real client via `X-Forwarded-For` instead of collapsing every client into a single shared rate-limit bucket. A fixed hop count is used (not `trust proxy: true`) so clients cannot spoof their IP.
- **Outbound response bodies are now bounded in bytes and time (SEC-3):** both the HTML and CSV fetch paths stream into a capped buffer (configurable via `MAX_RESPONSE_BYTES`, default 50 MiB) and reject oversized bodies up front via `Content-Length`; the content-fetch path also regained its 30 s default timeout (previously it silently passed no timeout, leaving requests unbounded in time).
