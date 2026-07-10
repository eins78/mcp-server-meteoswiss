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

> **Correction (post-PR review):** the premise "`date` already reads as local" turned out to be
> literally false at the time — `date` was computed via `timestampToDate()` on the raw UTC
> digits, with no timezone conversion, so it was actually a **UTC calendar day** wearing a
> local-looking label. GitHub Copilot's automated PR review caught the resulting bug (see
> "Copilot review fixes" below): an hour like `202603282300` UTC is `2026-03-29T00:00:00+01:00`
> locally, yet was being bucketed under the UTC-dated `"2026-03-28"` day object — an hourly
> entry whose own timestamp read "the 29th" nested inside a day literally labeled "the 28th".
> The *decision* to use local time for `time` was still correct (approved by Max, and the
> feature is inherently local-time-sensitive) — the fix was to make `date`'s bucketing live up
> to the premise, not to abandon it. See below.

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
- PR #99 opened (`Part of #98`, no closing keyword — #98 stays open for the station follow-up).

## Copilot review fixes

GitHub's automated Copilot PR review on #99 found two real issues, both fixed:

1. **Misleading doc comment.** The schema JSDoc said an empty `hourly` array means "no rain
   fell." Wrong — zero-mm hours are kept, not dropped, so a dry day still returns a 24-entry
   array of `value: 0.0`. `[]` actually means "no hourly data at all for that day." Reworded.

2. **UTC/local day-boundary mismatch (real bug, not a nitpick).** As detailed in the timezone
   correction above: `date` was UTC-calendar-day-keyed while `time` was local Europe/Zurich —
   so an hour close to local midnight could show a local calendar date one day ahead of the
   `date` field it was nested under. Consulted the advisor before fixing: the right call was to
   fix forward (make bucketing local-Zurich-consistent throughout) rather than retreat to UTC
   timestamps, since Max had already approved local time and the PR wouldn't merge without his
   review regardless — a concrete diff is a better artifact for him to react to than a paused
   question.

   Fix: added `zurichParts()`/`utcTimestampToZurichDate()` and switched **both** `groupByDate`
   (temperature) and `groupPrecipByDate` (precipitation) — plus `pickDaytimeIcon`'s day-match
   check — from UTC-date to local-Zurich-date bucketing, for non-station forecasts. Left the
   midday-hour icon heuristic (`hour >= 7 && hour <= 13`) as UTC on purpose — it only picks a
   representative icon and still lands near local midday within a local-day bucket; changing it
   added risk for no benefit. Station forecasts (`buildStationForecast`) untouched — out of scope,
   already daily-native.

   **Consequence worth flagging:** this changes the day-boundary definition for **all**
   non-station forecast fields (temperature min/max, weather icon — not just the new hourly
   precipitation), shifting from UTC calendar days to local Zurich calendar days. That's broader
   than "add precip," and is called out in the PR body for Max to scope down on review if he
   disagrees. Verified against the fixture (which conveniently spans the CET→CEST transition)
   that this doesn't change existing exact-value test outcomes: the day-1 total stayed 1.7mm and
   the DST-boundary assertions still passed, because only the last (0mm) hour of day 1 moved to
   day 2 — added a dedicated regression test asserting every hourly entry's local date matches
   its containing day, and that the boundary hour lands in day 2.

Re-ran `pnpm run ci` after both fixes — still 21 suites, 175 passed, 1 pre-existing skip.

## Tool description clarification + merge

Max reviewed PR #99, asked for two clarifications to the LLM-facing tool description in
`src/server.ts`, then authorized merging. Verified both against the code (not guessed) before
writing:

1. **Local time, no conversion needed.** Confirmed from `zurichParts()`/`groupPrecipByDate()`
   that every `hourly[].time` is built from the Zurich-local date+time+offset — never raw UTC.
   Description now says explicitly: "already local wall-clock time... It is NOT UTC — do not
   convert it."
2. **null / [] / value:0 distinction**, confirmed line-by-line: `value: 0` = dry hour, kept not
   omitted (only `val === null` rows are skipped); `hourly: null` = set explicitly in
   `buildStationForecast` for stations (no hourly source data at all); `hourly: []` = confirmed
   this only arises via `precipByDate.get(date) ?? []` in `buildHourlyAggregatedForecast` — an
   hourly-capable (non-station) point with a data gap for that specific day. Spelled out all
   three as bullets matching the existing "Accepts:" list style. Commit `f52299f`.

This mattered beyond wording: the linked eval suite (PR #100) had already shown smaller models
read local time far better than UTC and conflate the null/empty/zero states for precipitation —
the same trap Copilot's review caught in the schema doc. The tool description is literally what
the model reads, so precision here is a direct, cheap comprehension win, not just polish.

**Merge mechanics** — determined empirically since there's no CONTRIBUTING doc: compared the
last 20 merged PRs by parent-count (`git log -1 --format='%P' <mergeCommit>`). 18/20, including
both dependency PRs and feature/changesets-bot PRs, were single-parent squash commits titled
`{title} (#{number})`. Squash-merged PR #99 accordingly (`gh pr merge --squash`) — merge commit
`b6c5c65` on `main`. Remote branch auto-deleted (`delete_branch_on_merge: true`); local worktree
branch left alone (session was running inside it).

**Release-pipeline finding (discovered, not fixed):** the "Version Packages" GitHub Action
triggered post-merge, correctly consumed `.changeset/hourly-precip-forecast.md` (version bump +
CHANGELOG generated, changeset file deleted, pushed to `changeset-release/main`), but then failed
at PR creation: `HttpError: GitHub Actions is not permitted to create or approve pull requests.`
This is a repo/org Actions permission setting
(Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and
approve pull requests"), unrelated to this PR's content — the version bump commit exists on
`changeset-release/main`, just not exposed via an open PR. Flagged to Max rather than fixed
(changing repo settings wasn't in scope for this session).

## Pending / follow-ups

- [x] PR #99 reviewed, description clarified, and merged (`b6c5c65`) — done this session.
- [ ] Fetch `rre150h0` for stations (`point_type_id === 1`) + add a station hourly fixture to
      close the station gap noted in #98 (still open, tracks this).
- [ ] "Version Packages" release automation is blocked by a repo Actions permission setting —
      needs a repo admin to enable "Allow GitHub Actions to create and approve pull requests,"
      or someone to manually open a PR from `changeset-release/main`, before `meteoswiss-mcp`
      can be released with this feature.
- [ ] Clean up the `hourly-precip` worktree once done with it (`git worktree remove`).
