---
teaser: "Does labeling forecast timestamps in local time vs. UTC change whether LLMs answer time-based questions correctly? A 13-provider sweep says yes — local time wins decisively."
---

**What this tests:** whether labeling each hour in a forecast's time series with local time
(`2026-03-28T09:00:00+01:00`) instead of UTC (`2026-03-28T08:00:00Z`) changes whether LLMs —
especially small, cheap ones — can correctly answer real-world questions like "how much rain
falls at 9am?" This gated whether MeteoSwiss's `meteoswissLocalForecast` tool should ship hourly
precipitation data with local-time or UTC timestamps.

**How to read it:** look for `score` and pass counts broken down by "local" vs "utc" — the bigger
the gap, the more the UTC labeling confuses a model about which hour a value belongs to. The
cleanest, least-confounded test is `point-num`/`range-num` (exact-value lookups at a specific
hour): 100% correct with local-time labels, near-0% with UTC, across every model tier.

**Verdict:** keep local-time labeling. Full detail — cost, the provider list, every question
family, caveats about which comparisons are and aren't confounded — is below.
