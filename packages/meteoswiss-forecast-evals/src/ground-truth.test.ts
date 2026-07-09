/**
 * Offline unit tests locking in the ground-truth values computed from the committed fixtures.
 * These are the numbers the whole eval's gate table depends on — if a fixture or the Zurich
 * time math ever changes, this test should be the first thing that breaks. Run via `pnpm test`.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadFixture, toUtcIso } from "./fixture.js";
import {
  argmaxHour,
  canonicalReadings,
  dailyTotal,
  dayObjectFor,
  isDryAt,
  localDatesInOrder,
  offsetAt,
  sumRange,
  valueAt,
  wettestDate,
} from "./ground-truth.js";

describe("primary fixture (forecast-8001-2day-local.json) — real captured DST-spanning data", () => {
  const fixture = loadFixture("forecast-8001-2day-local.json");
  const readings = canonicalReadings(fixture);
  const [day1, day2] = localDatesInOrder(readings);

  test("has exactly two local calendar dates", () => {
    assert.equal(day1, "2026-03-28");
    assert.equal(day2, "2026-03-29");
  });

  test("day1 08:00 is 0.3mm (matches captured fixture)", () => {
    assert.equal(valueAt(readings, day1 as string, 8), 0.3);
  });

  test("day1 22:00 is dry", () => {
    assert.equal(isDryAt(readings, day1 as string, 22), true);
  });

  test("commute window 07:00-09:00 sums to 0.9mm (0.1+0.3+0.5)", () => {
    assert.equal(sumRange(readings, day1 as string, 7, 9), 0.9);
  });

  test("argmax hour on day1 is 09:00 at 0.5mm", () => {
    const result = argmaxHour(readings, day1 as string);
    assert.deepEqual(result, { hour: 9, value: 0.5 });
  });

  test("day1 total is 1.7mm; day1 is the wettest date (day2 is dry)", () => {
    assert.equal(dailyTotal(readings, day1 as string), 1.7);
    assert.equal(wettestDate(readings), day1);
  });

  test("DST: 08:00 on day2 (2026-03-29) is already CEST, offset +02:00", () => {
    assert.equal(offsetAt(readings, day2 as string, 8), "+02:00");
  });

  test("DST: 01:00 on day2 is still CET, offset +01:00 (before the spring-forward jump)", () => {
    assert.equal(offsetAt(readings, day2 as string, 1), "+01:00");
  });

  // Locks the preconditions `primaryQuestions()` relies on to fail-fast rather than fall back
  // to a default (see questions.ts — dst-offset and availability-day2 both throw instead of
  // silently defaulting if day2Obj/dst are missing). Combined with the "offset +02:00" test
  // above (dst is non-null), this test is what should break FIRST if this fixture ever changes
  // such that day2's declared day object disappears — not a silently-wrong default flowing
  // into the gate table.
  test("day2's declared day object exists, has a populated hourly[], and is dry (total 0)", () => {
    const day2Obj = dayObjectFor(fixture, day2 as string);
    assert.ok(day2Obj, "expected a day object for day2 in the primary fixture");
    assert.notEqual(day2Obj?.precipitation.hourly, null);
    assert.equal(day2Obj?.precipitation.total, 0);
  });
});

describe("fixture.ts toUtcIso — same instant, different label", () => {
  test("converts a CET local instant to its true UTC instant, not a naive relabel", () => {
    assert.equal(toUtcIso("2026-03-28T09:00:00+01:00"), "2026-03-28T08:00:00Z");
  });

  test("converts a CEST (post-DST) local instant correctly", () => {
    assert.equal(toUtcIso("2026-03-29T08:00:00+02:00"), "2026-03-29T06:00:00Z");
  });
});

describe("7-day fixture (synthesized, deterministic — see scripts/synth-7day-fixture.ts)", () => {
  const fixture = loadFixture("forecast-8001-7day-local.json");
  const readings = canonicalReadings(fixture);

  test("2026-04-09 (all-day-rain profile) is the unique wettest day", () => {
    assert.equal(wettestDate(readings), "2026-04-09");
  });

  test("2026-04-10 afternoon window 14:00-17:00 sums to 1.3mm", () => {
    assert.equal(sumRange(readings, "2026-04-10", 14, 17), 1.3);
  });
});

describe("station fixture — hourly is explicitly null", () => {
  test("every day has precipitation.hourly === null", () => {
    const fixture = loadFixture("forecast-station-local.json");
    for (const day of fixture.forecast) {
      assert.equal(day.precipitation.hourly, null);
    }
  });
});
