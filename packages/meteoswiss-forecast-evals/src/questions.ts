/**
 * The programmatic (lookup) question set. See PLAN.md "Question set" for the full table
 * and rationale. Every `expected` value here is DERIVED from the same fixture the model is
 * shown (via src/ground-truth.ts) — nothing is hand-typed — so ground truth cannot drift
 * from the data.
 *
 * Deviation from the original rough plan, found while building: a true "hourly: []" (empty
 * array, as opposed to null) case does not occur in `meteoswiss-mcp`'s current implementation
 * — `groupPrecipByDate` always emits an entry for every fetched hour, including zero-rain
 * hours (see ogd-local-forecast.ts). So the intended "null vs empty-array" question is
 * reframed as "null (station, truly unavailable) vs a populated-but-all-zero array (postal
 * code, dry day)" — the real distinction this codebase produces, tested against day 2 of the
 * primary fixture (a genuinely dry day with a populated hourly[]).
 */

import type { LocalForecastResponse } from "./types.js";
import {
  type CanonicalReading,
  argmaxHour,
  dailyTotal,
  dayObjectFor,
  isDryAt,
  offsetAt,
  sumRange,
  valueAt,
  wettestDate,
} from "./ground-truth.js";

const ANSWER_INSTRUCTION =
  "Respond with ONLY a single-line strict JSON object in the exact schema given — no markdown fences, no explanation, no extra keys.";

/**
 * A leaf expectation always names the JSON `key` the scorer should read the model's answer
 * from — the prompt's "Schema:" line declares that same key, so the two never drift apart.
 */
export type LeafExpected =
  | { key: string; kind: "bool"; value: boolean }
  | { key: string; kind: "number"; value: number; tolerance: number }
  | { key: string; kind: "hour"; value: number }
  | { key: string; kind: "date"; value: string }
  | { key: string; kind: "offset"; value: string }
  | { key: string; kind: "unavailable" };

export type Expected =
  LeafExpected | { kind: "compound"; parts: LeafExpected[] };

export type GeneratedQuestion = {
  id: string;
  family: string;
  fixtureLabel: string;
  promptText: string;
  expected: Expected;
};

export type PrimaryQuestionCtx = {
  readings: CanonicalReading[];
  fixture: LocalForecastResponse;
  day1: string;
  day2: string;
};

/** The 8 questions asked against the primary (DST-spanning, postal-code) fixture. */
export function primaryQuestions(ctx: PrimaryQuestionCtx): GeneratedQuestion[] {
  const { readings, fixture, day1, day2 } = ctx;
  const day1Obj = dayObjectFor(fixture, day1);
  if (!day1Obj) throw new Error(`No day object for ${day1} in fixture`);
  const day2Obj = dayObjectFor(fixture, day2);
  if (!day2Obj) throw new Error(`No day object for ${day2} in fixture`);

  const dry2200 = isDryAt(readings, day1, 22);
  const val0800 = valueAt(readings, day1, 8);
  const commuteSum = sumRange(readings, day1, 7, 9);
  const argmax = argmaxHour(readings, day1);
  const wettest = wettestDate(readings);
  const dailyTotalDeclared = day1Obj.precipitation.total;
  const dst = offsetAt(readings, day2, 8);

  // Every value consumed below must be fixture-derived, never a silent default — an eval whose
  // ground truth can degrade to a guess when a fixture changes would no longer be trustworthy.
  // (Previously `dst` fell back to `?? "+02:00"` and day2Available/day2Rained fell back to
  // `false`/`true` when day2Obj/dst were missing — masking a bad fixture instead of failing.)
  if (
    dry2200 === null ||
    val0800 === null ||
    argmax === null ||
    dailyTotalDeclared === null ||
    dst === null
  ) {
    throw new Error(
      "Ground truth computation failed for primary fixture — check fixture data",
    );
  }

  const day2Available = day2Obj.precipitation.hourly !== null;
  const day2Rained = (day2Obj.precipitation.total ?? 0) > 0;

  return [
    {
      id: "dry-2200",
      family: "point-bool",
      fixtureLabel: "primary",
      promptText: `Is it dry (no rain at all) at 22:00 local time on ${day1}? ${ANSWER_INSTRUCTION} Schema: {"answer": "yes" | "no"}`,
      expected: { key: "answer", kind: "bool", value: dry2200 },
    },
    {
      id: "val-0800",
      family: "point-num",
      fixtureLabel: "primary",
      promptText: `How many mm of rain fall during the 08:00 local-time hour on ${day1}? ${ANSWER_INSTRUCTION} Schema: {"mm": <number>}`,
      expected: { key: "mm", kind: "number", value: val0800, tolerance: 0.05 },
    },
    {
      id: "commute-sum",
      family: "range-num",
      fixtureLabel: "primary",
      promptText: `What is the TOTAL rainfall in mm during the local morning commute window 07:00-09:00 (inclusive of both endpoints) on ${day1}? ${ANSWER_INSTRUCTION} Schema: {"mm": <number>}`,
      expected: {
        key: "mm",
        kind: "number",
        value: commuteSum,
        tolerance: 0.05,
      },
    },
    {
      id: "commute-bool",
      family: "range-bool",
      fixtureLabel: "primary",
      promptText: `Does it rain at all (even a small amount) during the local morning commute window 07:00-09:00 (inclusive) on ${day1}? ${ANSWER_INSTRUCTION} Schema: {"answer": "yes" | "no"}`,
      expected: { key: "answer", kind: "bool", value: commuteSum > 0 },
    },
    {
      id: "argmax-hour",
      family: "argmax-time",
      fixtureLabel: "primary",
      promptText: `Which single local hour has the MOST rainfall on ${day1}? ${ANSWER_INSTRUCTION} Schema: {"hour": "HH:00"} (24-hour local time, e.g. "09:00")`,
      expected: { key: "hour", kind: "hour", value: argmax.hour },
    },
    {
      id: "wettest-day",
      family: "argmax-day",
      fixtureLabel: "primary",
      promptText: `Across the entire forecast provided, which calendar date (local) has the highest total rainfall? ${ANSWER_INSTRUCTION} Schema: {"date": "YYYY-MM-DD"}`,
      expected: { key: "date", kind: "date", value: wettest },
    },
    {
      id: "total-consistency",
      family: "cross-field",
      fixtureLabel: "primary",
      promptText: `What is the daily precipitation total (mm) declared for ${day1}, and does it match the sum of that day's hourly readings (allow for rounding)? ${ANSWER_INSTRUCTION} Schema: {"total_mm": <number>, "matches_hourly_sum": true | false}`,
      expected: {
        kind: "compound",
        parts: [
          {
            key: "total_mm",
            kind: "number",
            value: dailyTotalDeclared,
            tolerance: 0.05,
          },
          { key: "matches_hourly_sum", kind: "bool", value: true },
        ],
      },
    },
    {
      id: "dst-offset",
      family: "dst-trap",
      fixtureLabel: "primary",
      promptText: `What UTC offset applies to local time at 08:00 on ${day2} for this location? ${ANSWER_INSTRUCTION} Schema: {"utc_offset": "+HH:00" or "-HH:00"}`,
      expected: { key: "utc_offset", kind: "offset", value: dst },
    },
    {
      id: "availability-day2",
      family: "availability",
      fixtureLabel: "primary",
      promptText: `For ${day2}: is an hourly precipitation breakdown available in this data for this location, and did it rain at any point that day? ${ANSWER_INSTRUCTION} Schema: {"hourly_available": true | false, "rained": true | false}`,
      expected: {
        kind: "compound",
        parts: [
          { key: "hourly_available", kind: "bool", value: day2Available },
          { key: "rained", kind: "bool", value: day2Rained },
        ],
      },
    },
  ];
}

/** The station-fixture question: does the model correctly decline instead of hallucinating? */
export function stationQuestion(
  stationFixture: LocalForecastResponse,
): GeneratedQuestion {
  const day = stationFixture.forecast[0];
  if (!day) throw new Error("Station fixture has no forecast days");
  return {
    id: "station-null",
    family: "null-handling",
    fixtureLabel: "station",
    promptText: `How many mm of rain are forecast at 15:00 local time on ${day.date} for this location? If an hourly precipitation breakdown is not available for this location/point type, say so explicitly instead of guessing a number. ${ANSWER_INSTRUCTION} Schema: {"hourly_available": true, "mm": <number>} or {"hourly_available": false}`,
    expected: { key: "hourly_available", kind: "unavailable" },
  };
}

/**
 * Secondary, longer-horizon track (advisor recommendation, see PLAN.md): tests whether
 * legibility holds up over a full week (~168 hourly entries) rather than the 1.5-day primary
 * fixture — a proxy for "will consumers still cope once we add more time-series over more
 * days" (the next feature this eval is meant to derisk). Subordinate to the UTC-vs-local gate.
 *
 * Originally 2 questions; expanded to 5 (see PLAN.md "Compact long-series representation")
 * when Max asked whether a more compact hourly representation rescues tiny-tier comprehension
 * on this fixture (tiny tier scored ~50% here in the full sweep, vs. ~86-100% on the shorter
 * primary fixture). These 5 questions are run UNCHANGED against both the full-representation
 * fixture (fixtureLabel "sevenday") and the compact one (fixtureLabel "sevenday-compact", see
 * src/compact-representation.ts) — same ground truth either way, so the only variable is the
 * hourly representation's density, isolating that ablation the same way fixture.ts isolates
 * the local-vs-UTC one.
 */
export function sevenDayQuestions(
  readings: CanonicalReading[],
): GeneratedQuestion[] {
  const wettest = wettestDate(readings);
  const showerDaySum = sumRange(readings, "2026-04-10", 14, 17);
  const thuHour15 = valueAt(readings, "2026-04-09", 15);
  const monTotal = dailyTotal(readings, "2026-04-06");
  const tueTotal = dailyTotal(readings, "2026-04-07");
  if (thuHour15 === null) {
    throw new Error(
      "Ground truth computation failed for sevenday fixture — check fixture data",
    );
  }
  return [
    {
      id: "sevenday-wettest",
      family: "argmax-day",
      fixtureLabel: "sevenday",
      promptText: `Across this full week-long forecast, which single calendar date (local) has the highest total rainfall? ${ANSWER_INSTRUCTION} Schema: {"date": "YYYY-MM-DD"}`,
      expected: { key: "date", kind: "date", value: wettest },
    },
    {
      id: "sevenday-afternoon-shower",
      family: "range-num",
      fixtureLabel: "sevenday",
      promptText: `What is the TOTAL rainfall in mm during the local afternoon window 14:00-17:00 (inclusive) on 2026-04-10? ${ANSWER_INSTRUCTION} Schema: {"mm": <number>}`,
      expected: {
        key: "mm",
        kind: "number",
        value: showerDaySum,
        tolerance: 0.05,
      },
    },
    {
      id: "sevenday-thu-hour15",
      family: "point-num",
      fixtureLabel: "sevenday",
      promptText: `How many mm of rain fall during the 15:00 local-time hour on 2026-04-09? ${ANSWER_INSTRUCTION} Schema: {"mm": <number>}`,
      expected: {
        key: "mm",
        kind: "number",
        value: thuHour15,
        tolerance: 0.05,
      },
    },
    {
      id: "sevenday-mon-dry",
      family: "point-bool",
      fixtureLabel: "sevenday",
      promptText: `Was 2026-04-06 completely dry all day (0mm total rainfall)? ${ANSWER_INSTRUCTION} Schema: {"answer": "yes" | "no"}`,
      expected: { key: "answer", kind: "bool", value: monTotal === 0 },
    },
    {
      id: "sevenday-tue-total",
      family: "range-num",
      fixtureLabel: "sevenday",
      promptText: `What is the TOTAL rainfall in mm for the full day 2026-04-07? ${ANSWER_INSTRUCTION} Schema: {"mm": <number>}`,
      expected: { key: "mm", kind: "number", value: tueTotal, tolerance: 0.05 },
    },
  ];
}
