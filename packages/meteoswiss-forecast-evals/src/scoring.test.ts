/**
 * Offline unit tests for the lenient scorer (no network, no promptfoo, no OpenRouter).
 * Run via `pnpm test` (node's built-in test runner + tsx).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractJson, scoreResponse } from "./scoring-core.js";

describe("extractJson", () => {
  test("parses strict JSON", () => {
    assert.deepEqual(extractJson('{"answer":"yes"}'), { answer: "yes" });
  });

  test("strips a markdown code fence", () => {
    assert.deepEqual(extractJson('```json\n{"mm": 0.3}\n```'), { mm: 0.3 });
  });

  test("extracts JSON embedded in prose (lenient parsing)", () => {
    const raw =
      'Sure! Based on the data, the answer is {"mm": 0.9} — hope that helps.';
    assert.deepEqual(extractJson(raw), { mm: 0.9 });
  });

  test("returns undefined for genuinely unparseable text", () => {
    assert.equal(
      extractJson("it will probably rain a bit, hard to say exactly"),
      undefined,
    );
  });

  test("recovers the trailing answer object when reasoning leaks an earlier brace (real gpt-5.2 shape, see docs/results/2026-07-09-forecast-json-comprehension.md)", () => {
    const raw =
      'Thinking: I should return {"mm": 0.3} based on the data.\n\n{"mm":0.3}';
    // A naive first-`{`-to-last-`}` slice spans BOTH objects and fails to parse — this must
    // recover the real (last) object instead of returning undefined.
    assert.deepEqual(extractJson(raw), { mm: 0.3 });
  });

  test("prefers the LAST balanced block when reasoning and answer disagree", () => {
    const raw = 'I initially thought {"mm": 1} but on reflection {"mm": 0.3}';
    assert.deepEqual(extractJson(raw), { mm: 0.3 });
  });
});

describe("scoreResponse — leaf kinds", () => {
  test("bool: exact match passes", () => {
    const r = scoreResponse('{"answer":"yes"}', {
      key: "answer",
      kind: "bool",
      value: true,
    });
    assert.equal(r.outcome, "correct");
    assert.equal(r.pass, true);
  });

  test("bool: mismatch fails, not unparseable (formatting is fine, answer is wrong)", () => {
    const r = scoreResponse('{"answer":"no"}', {
      key: "answer",
      kind: "bool",
      value: true,
    });
    assert.equal(r.outcome, "wrong");
    assert.equal(r.pass, false);
  });

  test("number: within tolerance passes", () => {
    const r = scoreResponse('{"mm": 0.32}', {
      key: "mm",
      kind: "number",
      value: 0.3,
      tolerance: 0.05,
    });
    assert.equal(r.pass, true);
  });

  test("number: outside tolerance fails", () => {
    const r = scoreResponse('{"mm": 1.5}', {
      key: "mm",
      kind: "number",
      value: 0.3,
      tolerance: 0.05,
    });
    assert.equal(r.pass, false);
  });

  test('hour: accepts "09:00" and bare 9', () => {
    assert.equal(
      scoreResponse('{"hour":"09:00"}', { key: "hour", kind: "hour", value: 9 })
        .pass,
      true,
    );
    assert.equal(
      scoreResponse('{"hour":9}', { key: "hour", kind: "hour", value: 9 }).pass,
      true,
    );
  });

  test("hour: a full ISO timestamp coerces to the actual hour, not the year (real gpt-5.2 failure mode)", () => {
    const r = scoreResponse('{"hour":"2026-03-28T09:00:00+01:00"}', {
      key: "hour",
      kind: "hour",
      value: 9,
    });
    assert.equal(r.pass, true);
  });

  test('hour: "hour 9" (no colon) still coerces via the bare-digit fallback', () => {
    assert.equal(
      scoreResponse('{"hour":"hour 9"}', {
        key: "hour",
        kind: "hour",
        value: 9,
      }).pass,
      true,
    );
  });

  test("date: exact match required", () => {
    assert.equal(
      scoreResponse('{"date":"2026-03-28"}', {
        key: "date",
        kind: "date",
        value: "2026-03-28",
      }).pass,
      true,
    );
    assert.equal(
      scoreResponse('{"date":"2026-03-29"}', {
        key: "date",
        kind: "date",
        value: "2026-03-28",
      }).pass,
      false,
    );
  });

  test('offset: normalizes "+2:00" and "UTC+2" to "+02:00"', () => {
    assert.equal(
      scoreResponse('{"utc_offset":"+2:00"}', {
        key: "utc_offset",
        kind: "offset",
        value: "+02:00",
      }).pass,
      true,
    );
    assert.equal(
      scoreResponse('{"utc_offset":"UTC+2"}', {
        key: "utc_offset",
        kind: "offset",
        value: "+02:00",
      }).pass,
      true,
    );
  });

  test("unavailable: declining (false) is correct", () => {
    const r = scoreResponse('{"hourly_available": false}', {
      key: "hourly_available",
      kind: "unavailable",
    });
    assert.equal(r.pass, true);
  });

  test("unavailable: fabricating a value is wrong", () => {
    const r = scoreResponse('{"hourly_available": true, "mm": 2}', {
      key: "hourly_available",
      kind: "unavailable",
    });
    assert.equal(r.pass, false);
  });

  test("unavailable: omitting the flag entirely but fabricating a number is wrong (bare fabrication)", () => {
    const r = scoreResponse('{"mm": 2}', {
      key: "hourly_available",
      kind: "unavailable",
    });
    assert.equal(r.pass, false);
  });

  test("unavailable: declining the flag but ALSO fabricating a number is wrong (mixed signal)", () => {
    const r = scoreResponse('{"hourly_available": false, "mm": 2}', {
      key: "hourly_available",
      kind: "unavailable",
    });
    assert.equal(r.pass, false);
  });

  test("unavailable: declining with no other keys at all is still correct", () => {
    const r = scoreResponse('{"hourly_available": false}', {
      key: "hourly_available",
      kind: "unavailable",
    });
    assert.equal(r.pass, true);
  });

  test("unavailable: fabrication check is generic, not hardcoded to 'mm' — a differently-named numeric key (e.g. a gust question's 'gust_kmh') also fails", () => {
    const r = scoreResponse('{"gust_available": false, "gust_kmh": 35}', {
      key: "gust_available",
      kind: "unavailable",
    });
    assert.equal(r.pass, false);
  });

  test("unavailable: a non-numeric other key (e.g. a units string) does not count as fabrication", () => {
    const r = scoreResponse('{"gust_available": false, "unit": "km/h"}', {
      key: "gust_available",
      kind: "unavailable",
    });
    assert.equal(r.pass, true);
  });

  test("unavailable: a prose note containing digits is NOT a fabrication (EVAL-1)", () => {
    // The digit-run inside the note must not be misread as a fabricated number.
    const r = scoreResponse('{"hourly_available": false, "note": "no data for 2026-04-06"}', {
      key: "hourly_available",
      kind: "unavailable",
    });
    assert.equal(r.pass, true);
  });
});

describe("scoreResponse — compound + unparseable", () => {
  test("compound: all parts correct -> pass, score 1", () => {
    const r = scoreResponse('{"total_mm": 1.72, "matches_hourly_sum": true}', {
      kind: "compound",
      parts: [
        { key: "total_mm", kind: "number", value: 1.7, tolerance: 0.05 },
        { key: "matches_hourly_sum", kind: "bool", value: true },
      ],
    });
    assert.equal(r.pass, true);
    assert.equal(r.score, 1);
  });

  test("compound: one of two parts correct -> partial, score 0.5, not pass", () => {
    const r = scoreResponse('{"total_mm": 1.7, "matches_hourly_sum": false}', {
      kind: "compound",
      parts: [
        { key: "total_mm", kind: "number", value: 1.7, tolerance: 0.05 },
        { key: "matches_hourly_sum", kind: "bool", value: true },
      ],
    });
    assert.equal(r.pass, false);
    assert.equal(r.score, 0.5);
    assert.equal(r.outcome, "partial");
  });

  test('completely unparseable response is its own outcome, distinct from "wrong"', () => {
    const r = scoreResponse("I think it might rain, not totally sure", {
      key: "mm",
      kind: "number",
      value: 0.3,
      tolerance: 0.05,
    });
    assert.equal(r.outcome, "unparseable");
    assert.equal(r.pass, false);
  });
});
