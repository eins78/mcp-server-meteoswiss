---
"meteoswiss-mcp": patch
---

Security hardening from the 2026-07-11 security review, focused on the unauthenticated DoS chain and defense-in-depth:

- **Rate limiting now works behind the proxy (SEC-2):** set Express `trust proxy` (configurable via `TRUST_PROXY`, default 1 hop) so `req.ip` reflects the real client via `X-Forwarded-For` instead of collapsing every client into a single shared rate-limit bucket. A fixed hop count is used (not `trust proxy: true`) so clients cannot spoof their IP.
