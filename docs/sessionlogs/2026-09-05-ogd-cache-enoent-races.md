# Two ENOENT races in the OGD disk cache, and the compute the cache never saved

**Date:** 2026-09-05
**Source:** Claude Code (Opus 5)
**Session:** Max's morning briefing lost its weather section. His question was specifically *"is the MCP service broken, or the scripts we call it from?"* — answer that first, then propose fixes. Refs #145.

## Summary

`meteoswissLocalForecast` was failing intermittently in production with
`ENOENT: no such file or directory, rename '…/<key>.tmp.<n>' -> '…/<key>.csv'`.

**Both.** The server had a real defect, *and* the fallback script had a separate one that hid it.
Upstream MeteoSwiss was fine throughout — HTTP 200 on every probe, which is worth stating plainly
because the widely-repeated workaround for this symptom assumes otherwise.

Four things came out of it, in descending order of importance:

1. A failing **cache write** was failing the whole **request**.
2. Two independent races both produced that same `ENOENT`.
3. The cache was not saving the compute it was built to save — at all.
4. One claim in my own proposal was wrong, and a test caught it.

## Root cause

### The one that actually mattered

`getCsvData` awaited `writeToDiskCache` on the path that had *already successfully fetched the
data*. Any write failure — for any reason — propagated out and failed the tool call, discarding a
good response. That is the outage. It is independent of why the write failed, and a three-line
`try`/`catch` closes it.

This is worth separating from the races because it is the general fix: it would have prevented this
morning's failure without either race being understood, and it will prevent the next unrelated write
failure too.

### Race 1 — the pruner ate in-flight writes

`pruneDiskCache` deleted **every** `.tmp` file it encountered, unconditionally. A concurrent
`writeToDiskCache` writes to `<key>.tmp.<n>` and then renames it into place; if a prune ran in that
window, the temp file was gone before the `rename`, which then failed `ENOENT` **on the source
path**. That detail is the tell — an `ENOENT` naming the `.tmp` side is not a missing *destination*
directory, which is what the popular `mkdir -p` workaround addresses.

Six concurrent 30 MB writers reproduced it reliably: 4–5 of 6 threw.

### Race 2 — millisecond-resolution temp names

Temp names came from `Date.now()`. Two writers to the same cache key inside one millisecond chose
the same temp path; the first `rename` moved it, the second hit `ENOENT`. 40 same-key writers
produced 30 failures. This needs no pruner at all, which is why fixing only race 1 would have left a
residue of unexplained failures.

### Why the standard workaround could not have worked

Every account of this symptom recommends `mkdir -p` on the cache directory, and our own
`TODO.md` had adopted it. It is structurally impossible here: the cache lives on the container's
internal `/tmp` with **no bind mount**, so there is no host directory to create. The host cache dirs
that looked empty were empty because nothing ever wrote to them. Retracted in the wiki.

## Fix

**1. Best-effort cache writes** (`65240d5`). `cacheWriteBestEffort` wraps the write; on failure it
logs and returns the fetched data anyway. Called from both `getCsvData` and `getLatin1CsvData`.

**2. `write-file-atomic` v5, and delete the sweep** (`f1976f3`). Rather than patch the temp-name
scheme, replace it. The library's names mix pid + thread id + a monotonic counter (race 2 gone), and
it serialises concurrent writes to the same path and removes its own temp files on exit — which
leaves the `.tmp` sweep with no job, so the sweep is deleted (race 1 gone). Local typings were added
because the package ships none and `@types/write-file-atomic` is a major version behind.

`pruneDiskCache` gained `removeEmptyDirs`, reaping the per-day `forecasts/<date>-ch/` husks — 42 of
the container's 43 were already empty.

**3. Conversion memo** (`f6052d6`). Keyed on a sha256 of the *input HTML* plus url/format/metadata
flag. Because the key includes the HTML, it is a pure-function memo: it cannot serve markdown
staler than the HTML it was derived from, so it needs no TTL and cannot disagree with `httpCache`
about freshness.

**4. `@epic-web/cachified`** (`555f92c`) above the memo, keyed on the request, supplying
single-flight and stale-while-revalidate. cachified is a *wrapper, not a store*, so this also
supplies an entry-count-bounded LRU Map.

**5. Config** (docker-infra `727e3ff`, **pending a container restart**). `OGD_CACHE_MAX_BYTES=512Mi`
— the 256 MiB default cannot hold one forecast run (6 × ~30 MB ≈ 180 MB), and the cache was observed
at 236 MiB evicting the current run's own files. And `DEBUG=mcp:data`, which had been unset, silently
suppressing every eviction and prune log line in production for weeks.

## Measured

| | before | after |
|---|---|---|
| Race 1 — 6 writers × 30 MB, staggers 0–800 ms | 4–5 of 6 threw | **0/6 at every stagger, 6/6 cached** |
| Race 2 — 40 same-key writers | 30 ENOENT | **0** |
| Same page, 3 consecutive fetches | 271 / 62 / 59 ms | **232 / 0 / 0 ms** |

Determinism was **tested before memoising**, not assumed: 6 runs × 2 pages × both output formats,
one distinct output each. Memoising a nondeterministic function would be a correctness bug rather
than an optimisation.

## Decisions and things that went wrong

**The compute the cache existed for did not exist.** Max's stated original motivation was saving CPU
on HTML→markdown conversion. Tracing it: `httpCache` stored the HTML so repeat requests skipped the
network, but the conversion re-ran every single time and produced identical bytes. The saving had
never been implemented. This reframed the work — the resilience fix and the compute fix are separate
problems in separate caches, and only the first one caused the outage.

**I published a wrong claim about cachified.** I scored its stale-if-error as out-of-the-box via
`fallbackToCache`. Reading the installed source while wiring it up: `if (forceFresh && fallbackToCache > 0)`
— the option only applies to *forced* refreshes, and this path never forces one. Setting it would
have been decoration implying a property we did not have, so it was removed. The property does hold,
via `staleWhileRevalidate` alone, which is narrower than claimed. **A test caught this, not review** —
it is exactly what would have shipped unnoticed had I only tested the happy path.

**Two tests were rewritten for asserting too weakly.** The memo tests initially compared only output,
which passes on unmemoised code because the conversion is deterministic; they now count conversions
via an `expandWebComponents` probe. And a test named "serves the stale page when upstream fails" only
asserted the fetch happened once — proving "still cached", not "serves stale". Rewritten with an
explicit discriminator: a second fetch must have been *attempted*, which is only true if the entry
had genuinely expired.

**A false alarm worth recording.** 94 integration tests failed at baseline. They were not
pre-existing breakage — the harness spawns `node dist/index.js` and `dist/` did not exist. `pnpm run
build` cleared all 94. I came close to reporting them as pre-existing failures, which would have been
false.

## Not done, deliberately

- **Fix 3, `Promise.allSettled` in `ogd-local-forecast.ts:430`** — when several sibling parameter
  fetches fail, only one error surfaces. Real, but it changes a user-visible error message, which is
  a different kind of change from a cache fix. Left open in #145.
- **Persisting `httpCache` to disk — recommended against.** After the memo and cachified landed it is
  no longer the hot path (a repeat request inside TTL never reaches it), its TTLs are upstream-header
  derived with a 60 s floor so most entries restored across a restart would already be expired,
  restarts are usually releases (when you *want* fresh data), and it would recreate on a second store
  the write-race surface this session removed from the first. Not a memory concern either — the 30 MB
  CSVs pass `useCache: false` and never enter it.
- **Not restarting the production container.** The env vars are committed and pushed but inert until
  restart; reconnecting sessions trip the deploy health check, so the timing is Max's call.

## One unrelated commit, on purpose

`dbc688e` refreshes stale `pnpm.overrides` security pins. It has nothing to do with the cache and is
a separate commit so it can be reviewed or dropped independently — but the Security & Dependency
Check was red and would not go green without it.

It is drift, not this branch. `main` last ran CI on 2026-07-24 and `pnpm audit` queries live data;
six weeks of chained advisories had overtaken pins the repo already owned, each advisory now covering
the pinned version itself (`fast-uri` 4.1.1 vs `<4.1.3`, `undici` 8.7.0 vs `<8.9.0`, `qs` 6.15.3 vs
`<6.16.0`, `js-yaml`, `ip-address`, `hono`, and three `brace-expansion` ranges). `browserslist` and
`@humanfs/node` were newly flagged with no pin at all. `main` would fail this check today too.

Ruled out that the two new dependencies caused it rather than assuming: neither appears in any of the
11 advisory paths, `@epic-web/cachified` has zero dependencies, and `write-file-atomic@5.0.1` was
already in the tree — the lockfile gained a specifier line, not a package.

34 vulnerabilities (16 high) → 5, of which 4 are `low` and 1 is the already-documented Windows-only
`@hono/node-server` advisory. Every target version was checked against pnpm's 24 h
minimum-release-age *before* pinning (freshest: `fast-uri` 4.1.3, two weeks old), so nothing is
age-blocked, **no advisory was added to the ignore list, and the policy is not weakened**. No major
bumps of `jest`, `mcp-remote` or the MCP inspector — that stops being mechanical and belongs in its
own PR.

## Verification

`pnpm run lint` clean (TypeScript, ESLint, skills parity). Full suite **32 suites / 262 passed /
1 skipped / 0 failed**; 5 suites are new here. Every new test was confirmed to fail against the
unfixed code before being kept — the resilience test 2/2, the memo tests 1-vs-2 conversions, the
stale test with the SWR window zeroed.

All six required checks green on #146: Lint/Build/Test, Security & Dependency Check, Docker Build
Test, Skill Validation, Forecast Evals, dependency-diff. The overrides on
`minimatch`/`brace-expansion` reach into Jest's own file matching, so the suite is the guard there
and it stayed at 32/262.

## Follow-ups

- [ ] Restart `meteoswiss_mcp_server` to pick up `OGD_CACHE_MAX_BYTES` / `DEBUG` (docker-infra `727e3ff`).
- [ ] Fix 3 (`Promise.allSettled`) — still open in #145.
- [ ] With `DEBUG=mcp:data` live, confirm from real logs that eviction stops firing mid-run at 512 MiB.
