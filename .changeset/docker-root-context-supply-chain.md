---
"meteoswiss-mcp": patch
---

Harden the Docker build and refresh transitive security pins.

The image now builds from the repository-root context using the **frozen workspace
lockfile**, so the shipped image includes every root-level `pnpm.overrides` security pin
(path-to-regexp, hono, undici, ws, form-data, ip-address, fast-uri, …). Previously the
Dockerfile built from the single package directory with `--no-frozen-lockfile`, which
re-resolved against the live registry — dropping those overrides and, after pnpm's
`minimumReleaseAge` policy landed, failing the build on freshly-published transitive
versions (`js-yaml@5.2.2`, `undici-types@7.29.0`). The stale per-package lockfile is
removed; a `pnpm deploy` step produces the self-contained production tree.

Security overrides bumped to close new advisories: `fast-uri` → 4.1.1 (CVE-2026-16221)
and `brace-expansion` → 1.1.16 / 2.1.2 (CVE-2026-13149). Two dev-only / non-applicable
advisories are documented in `pnpm.auditConfig` (js-yaml, dev-only — fast-follow to 5.2.2
once it clears the release-age window; `@hono/node-server`, a Windows-only path-traversal
that does not affect the Linux/Docker deployment).
