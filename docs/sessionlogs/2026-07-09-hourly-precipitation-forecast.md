# Hourly Precipitation in getLocalForecast

**Date:** 2026-07-09
**Model:** Claude Opus 4.8 (worktree `hourly-precip`, branch `worktree-hourly-precip`)
**Ticket:** [#98](https://github.com/eins78/meteoswiss-llm-tools/issues/98)

## Motivation

`meteoswissLocalForecast` only returned daily precipitation totals. Daily totals hide *when*
rain falls, which is often more decision-relevant than the total (biking to work at 08:00 vs.
rain arriving at 22:00 are very different situations for the same "3mm" day).

## Key finding (verified before any implementation)

The hourly data was **already being fetched and discarded**. In
`src/data/ogd-local-forecast.ts`, non-station points (postal codes, mountain points) fetch
`HOURLY_PARAMS = ['tre200h0', 'rre150h0', 'jww003i0']`. `rre150h0` is hourly precipitation in
mm — confirmed against the fixture (`test/__fixtures__/ogd/forecasts/rre150h0.csv`, one value
per hour, 00:00–23:00). The old `buildHourlyAggregatedForecast()` summed these into the daily
total via `groupByDate()`, which strips timestamps — so the per-hour breakdown was thrown away
immediately after being computed. This meant the feature required **no new data source or
fixture** for the happy path — just retaining what was already in memory.

## Decisions and rationale (the non-obvious part)

### Timezone: local Europe/Zurich with UTC offset, not UTC

Initial instinct was to stay consistent with the codebase's internal use of UTC (`todayUtc()`,
`YYYYMMDDhhmm` timestamps, the `pickDaytimeIcon` "07-13 UTC ≈ 09-15 CET" comment). Consulted
the advisor tool before committing to this, which reframed the consistency argument: the
**output contract**, not the internal grouping machinery, is what a new field must match. The
sibling `date` field (`"2026-03-28"`) is a bare date with no timezone marker — every consumer
already reads it as local. Surfacing UTC-Z hourly times next to that field would have been the
*inconsistent* choice, and the feature's entire value proposition (commute planning) is
inherently local-time-sensitive anyway. Landed on:

- `time` = fully-qualified ISO 8601 with offset, e.g. `2026-03-28T09:00:00+01:00`.
- Implemented via a module-level `Intl.DateTimeFormat` (`timeZone: 'Europe/Zurich'`,
  `timeZoneName: 'longOffset'`, `hourCycle: 'h23'`) — no new dependency, Node 22 ships full ICU.
- Verified DST correctness with a throwaway script before writing any test assertions: the
  fixture data happens to span 2026-03-28 → 2026-03-29, and 2026-03-29 is the CET→CEST
  spring-forward in Switzerland. Confirmed the offset flips from `+01:00` to `+02:00` at UTC
  01:00 that day (02:00 local is skipped). This let the integration test assert the DST
  transition directly instead of just checking "a string came back."

### `total` and `hourly` must derive from the same list

Rewrote `buildHourlyAggregatedForecast` so the per-day `{time, value}[]` array is built first
(new `groupPrecipByDate` helper, replacing the old `groupByDate` call for precip — `groupByDate`
is retained only for temperature), and `total = round(sum(hourly values) * 10) / 10` is computed
from that same array. Prevents the two fields from silently diverging in a future edit.

### Stations: ship the gap, don't silently omit it

Stations (`point_type_id === 1`) use `DAILY_PARAMS` and never fetch `rre150h0`. Rather than
fetch it now (would need a new station hourly fixture, and no way to verify live station data
offline), stations report `precipitation.hourly: null` — explicitly distinct from `[]` (dry but
available). The gap is documented in the GitHub ticket as an explicit follow-up, not silently
dropped.

### Schema shape

`precipitation: { total, unit, hourly: Array<{time, value}> | null }` — nested under the
existing precipitation block rather than a new top-level array, so the breakdown sits next to
the total it explains. Output type is a plain TS type (not Zod-validated at the tool boundary,
consistent with the existing `DailyForecast`/`LocalForecastResponse` types).

## Implementation

- `src/schemas/ogd-local-forecast.ts`: added `HourlyPrecip` type; extended `DailyForecast`.
- `src/data/ogd-local-forecast.ts`: added `zurichFormatter` + `utcTimestampToZurichIso()`;
  added `groupPrecipByDate()`; reworked `buildHourlyAggregatedForecast()` precip handling;
  `buildStationForecast()` now sets `hourly: null` explicitly.
- `src/server.ts`: updated the `meteoswissLocalForecast` tool description to mention the new
  field and the station limitation.
- `test/integration/ogd-local-forecast.test.ts`: extended the postal-code test with exact-value
  assertions (not just shape) for a known rainy hour, a `total`-matches-`sum(hourly)` check, and
  a dedicated DST-boundary test asserting both `+01:00` and `+02:00` offsets appear across the
  fixture's day-2 series. Station test now asserts `hourly === null`.
- `.changeset/hourly-precip-forecast.md`: minor bump (additive, backward-compatible).

## Verification

`pnpm run ci` (tsc lint + eslint + build + full jest suite) — 21 suites, 175 passed, 1
pre-existing skip (documented macOS port-mapping flake, unrelated).

## Result

- Commit `92c6337` on branch `worktree-hourly-precip`, pushed to origin.
- GitHub issue #98 filed with problem statement, finding, proposed shape, and station-gap
  follow-up.
- No PR opened yet — left for Max to open (or request in a follow-up session).

## Pending / follow-ups

- [ ] Fetch `rre150h0` for stations (`point_type_id === 1`) + add a station hourly fixture to
      close the station gap noted in #98.
- [ ] Open the PR from `worktree-hourly-precip` to `main`.
