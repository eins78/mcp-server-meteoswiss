---
"meteoswiss-mcp": minor
---

Fix intermittent `ENOENT … rename` failures that made forecast requests fail, and make the content cache actually save the conversion work it was built for.

**The outage.** A failing *cache write* was taking down the whole request. A cache is an optimisation; a failed optimisation must not fail the request. Cache writes are now best-effort — the fetched data is returned and served regardless, with the failure logged.

Two independent races produced that identical error, and both are closed:

- `pruneDiskCache` deleted every `.tmp` file it found, including ones a concurrent write was still using — so the write's own temp file vanished before its `rename`. Writes now go through `write-file-atomic`, whose per-path queue and exit-time cleanup make the sweep unnecessary, and the sweep is gone.
- Temp names were built from `Date.now()`, so two writers to the same key in the same millisecond picked the same name; one renamed it away and the other hit `ENOENT`. `write-file-atomic`'s names mix pid, thread id and a monotonic counter, which cannot collide that way.

Measured against the built artifact: six concurrent 30 MB writers went from 4–5 of 6 failing to **0 of 6** at every stagger tested, and 40 same-key writers from 30 `ENOENT` to **0**.

**Converted pages are now cached.** The HTML was cached but the HTML→markdown conversion was re-run on every request, reproducing a byte-identical result. Two layers were added: a memo keyed on a hash of the *input HTML* (so it can never serve markdown staler than its source, and needs no TTL), and `@epic-web/cachified` above it for single-flight and stale-while-revalidate — so concurrent requests for one page do one fetch and one conversion, and an unreachable MeteoSwiss degrades to slightly-stale content instead of an error. Same page, three consecutive requests: **271/62/59 ms → 232/0/0 ms**.

`pruneDiskCache` also now reaps cache directories once they are empty, so the per-day `forecasts/<date>-ch/` husks no longer accumulate indefinitely.

New optional environment variables: `CONTENT_CACHE_TTL_MS`, `CONTENT_CACHE_SWR_MS`, `CONTENT_CACHE_MAX_ENTRIES`, `CONTENT_MEMO_MAX_ENTRIES`.
