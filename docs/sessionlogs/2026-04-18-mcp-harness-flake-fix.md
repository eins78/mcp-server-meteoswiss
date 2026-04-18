# MCP Integration Test Boot-Race Flake — Fix

**Date:** 2026-04-18  
**Session type:** Bug fix (CI test flake)  
**Operator:** Claude Sonnet 4.6 (automated session)  
**Branch:** `worktree-mcp-harness-flake`  
**PR:** https://github.com/eins78/meteoswiss-llm-tools/pull/86

---

## Flake Signature

PR #83 (trivial 27-line addition of a `meteoswiss_mcp_build_info` Prometheus gauge in `support/metrics.ts`) failed CI twice in a row:

- **Attempt 1** (2026-04-18 20:03Z): `test/integration/search-multiword.test.ts` port 38540
- **Attempt 2** (2026-04-18 20:34Z): `test/integration/meteoswiss-search.test.ts` port 35392

Both threw:
```
Server failed to start in time (100 attempts on port NNNNN)
  at MCPClient.waitForServer (test/integration/mcp-client.ts:73:11)
```

Different test files and different ports each attempt — classic race condition, not a deterministic bug.

## Root Cause

**13 integration test files** each call `MCPClient.start()` which spawns two child processes:
1. `node dist/index.js <port>` — the MCP HTTP server
2. `npx mcp-remote http://localhost:<port>/mcp` — the protocol bridge

`waitForServer` polls TCP connect every 300 ms for up to 100 attempts (30-second budget). With no `maxWorkers` cap in `jest.config.js`, Jest runs multiple test suites concurrently on the 2-vCPU GitHub Actions runner. Under CPU starvation from 13 concurrent server+mcp-remote process pairs, some Node.js server processes can't complete event-loop initialization within the 30-second window.

The failing test rotates between runs because the outcome depends on OS scheduler timing.

Secondary observation: `mcp-client.ts` has no `exit` event handler on the server process. A silent crash (e.g., from a port conflict) goes undetected — the test just polls until timeout. This is a latent defect, not the root cause here.

## Fix

One line added to `packages/meteoswiss-mcp/jest.config.js`:

```js
maxWorkers: process.env.CI ? 1 : '50%',
```

GitHub Actions automatically injects `CI=true`, so CI serializes all Jest test workers (eliminating concurrency between integration tests) while local dev keeps the default 50%-of-CPUs parallel behavior.

## Local Reproduction

Did not reproduce locally (Mac Mini M4 Pro has sufficient CPUs to absorb the concurrency). Ran `pnpm test` 3× — stable 19/20 suites passing each time. The 1 failing suite (`port-mapping.test.ts`) is the pre-existing macOS parallel-Jest flake documented in project memory — unrelated to this fix.

Fix correctness relies on CI for definitive verification (consistent reproduction on 2-vCPU runners).

## Files Changed

- `packages/meteoswiss-mcp/jest.config.js` — +1 line, no changeset (test-infra change)

## Status

PR #86 filed 2026-04-18, awaiting review. Work fully landed on branch `worktree-mcp-harness-flake`; orchestrator to rebase PR #83 onto main after merge.
