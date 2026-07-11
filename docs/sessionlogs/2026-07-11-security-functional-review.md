# Security & Functional Review — Autonomous Multi-Agent Audit

**Date:** 2026-07-11
**Model:** Claude Fable 5 (worktree `secreview`, branch `secreview`, stacked on #118 `worktree-quatico-showcase-docs`)
**Delegated by:** Max (away — run autonomously to a reviewable PR)
**PR:** #130
**Deliverable:** `docs/reviews/2026-07-11-security-functional-review.md`
**Handoff:** `.delegate-status.md` (for a fresh Opus session to execute the fixes)

## What this delivers

A hardcore security + functional review of the whole `meteoswiss-llm-tools` monorepo, primary
focus the MCP server. Report only — no product code changed. A follow-up session implements the
fix plan.

## Approach

Fanned out **8 parallel review subagents** by concern, each writing structured findings
(severity, file:line, trigger/repro, impact, fix, confidence) to its own status file to avoid
collision:

- A — `fetch` SSRF surface + prompt-injection/tool-poisoning + JSDOM safety
- B — transport / CORS / session / `server.ts` schema enforcement
- C — the DoS chain end-to-end
- D — data-layer outbound HTTP (geocode/OGD URL construction, path traversal, parsing)
- E — input validation across all 7 tool schemas
- F — functional correctness of the MCP package + ReDoS
- G — skills package, skills↔MCP parity, test-coverage holes
- H — dependency vulns, secrets, Docker/CI, the upstream-cap question

Before dispatching, an advisor pass sharpened the fan-out: split functional from security cleanly,
gave the DoS chain a single end-to-end owner, gave prompt-injection an explicit owner, and — most
importantly — **calibrated severity to the deployment** (public, unauthenticated, read-only,
`*.admin.ch` allowlist) so the report wouldn't inflate no-auth / CORS / SSRF into false criticals.
Load-bearing security claims (dead `Promise.race` timeout, missing `trust proxy`, default
`redirect:'follow'`, never-defaulted content-fetch timeout, in-memory-only caches, `URLSearchParams`
geocoders) were independently re-verified against the code rather than relayed.

## Results

**2 HIGH, 10 MEDIUM, 32 LOW** + info/accepted/verified-safe.

- **HIGH** — a DoS chain on the unauthenticated endpoint: synchronous JSDOM parse blocks the
  single-threaded event loop (its 10s timeout is dead code because the parse is synchronous), and
  rate limiting is inert behind the proxy (`trust proxy` never set → one shared bucket). The chain
  was split by mechanism: HIGH for the two attacker-triggerable links, MEDIUM for the origin-gated
  body buffer.
- **MEDIUM** — SSRF-via-redirect (uncertain, allowlist-bounded), unbounded body/disk cache, and
  **five silently-wrong-data functional bugs** (climate "Paris" → Swiss station; UTC-vs-Zurich
  forecast day drop; ISO-8601 timestamp contract violation; pollen total-outage reads as success;
  lexicographic date filtering). Silently-wrong data is the worst class for a weather product.
- **Verified good:** domain allowlist robust (userinfo/case/punycode/bare-path), JSDOM safe
  defaults, all tools validate inputs+outputs, no URL injection, no secrets, clean audits, ReDoS &
  prototype-pollution clean, parity green (ran `lint:parity`), solid Docker posture.

The report ends with an **ordered, one-issue-per-commit fix plan** (29 commits) grouped
security-first → silently-wrong-data → hardening/cleanup → tests/skills, with infra items flagged
as out-of-scope (separate `~/Docker` repo).

## Decisions & calibration notes

- **Did not run the `security-review` skill** — it targets *pending changes on the current branch*;
  the tree was clean and the mandate was a whole-codebase audit, so the explicit fan-out protocol
  was followed instead.
- **Deflated deliberately** to keep signal high: no-auth (accepted design), CORS (low footgun),
  SSRF-redirect (medium/uncertain), outbound-buffer DoS (medium — origin not attacker-selectable).
- **Marked uncertain** and not overstated: SEC-4, FUN-11, FUN-18's Zod-4 interaction, and the live
  swisstopo fuzzy behavior behind FUN-1.

## Handoff

PR #130 is up (base #118), green-pending on a docs-only change. **Not merged** — per standing policy
Max merges. The fix session should read `.delegate-status.md`, execute the numbered plan, add
changesets for product-code commits, and keep staging surgical (this worktree has drifted
`node_modules`).
