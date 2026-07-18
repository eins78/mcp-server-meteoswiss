---
teaser: "Should the forecast JSON include a wind-gust field, and should temperature be nested or flattened? A 2×2 factorial test across model tiers says: ship both changes — neither hurts comprehension."
---

**What this tests:** two follow-up design questions about the shape of the forecast JSON, asked
before adding more hourly fields (sunshine, wind, temperature) to `meteoswissLocalForecast`: (1)
include a wind-gust field alongside wind speed, or leave it out? (2) keep temperature nested in
its own object, or flatten it to plain top-level fields like every other measurement? Run as one
combined 2×2 test — not two separate single-question tests — specifically so any interaction
between the two choices would show up rather than being assumed away.

**How to read it:** the "main effects" table shows each choice's average score on its own; the
"2×2 cell means" table shows all four combinations together, to check whether adding gust hurts
more when temperature is also flattened (or vice versa) — it doesn't, the two choices are
effectively independent.

**Verdict:** ship both — add the gust field, flatten temperature. Neither change measurably hurt
how well models answered questions, at any model tier.
