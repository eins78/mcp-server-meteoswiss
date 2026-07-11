/**
 * Secondary track (per ../docs/spec.md "Secondary track: multi-series mock (shape A vs shape
 * B)"): a hand-authored MOCK of the multi-series hourly forecast shape (issue #101) — hourly
 * precipitation + sunshine + wind + temperature, generalizing #99's precipitation-only series.
 * This was a standalone mock built to compare candidate container shapes BEFORE the feature
 * was implemented, so the shape choices below (Q1 gust, Q3 all-flat) would have evidence
 * behind them ahead of writing any production code. `meteoswiss-mcp` now emits this same
 * settled shape (see `packages/meteoswiss-mcp/src/schemas/ogd-local-forecast.ts`) — this file
 * remains the eval harness that produced that decision, not a live consumer of it.
 *
 * Kept clearly subordinate to the UTC-vs-local gate: one day, one small hourly table, run
 * across a small model slice — not folded into the primary question set.
 *
 * History:
 *   - Round 1 (5 -> 11 questions, see ../docs/results/2026-07-09-forecast-json-comprehension.md
 *     "Multi-series eval, expanded"): Shape A ("parallel arrays": precipitation.hourly /
 *     sunshine.hourly / wind.hourly, each an independent { time, value } series) vs Shape B
 *     ("unified per-hour objects": one hourly[] array of { time, precip_mm, sunshine_minutes,
 *     wind_kmh } objects). Shape B won (84% vs 76%, +40pt on compound cross-series questions)
 *     and is the ONLY shape carried forward — Shape A is not exercised below (`shapeAFixture`/
 *     the "multiseries-a"/"multiseries-b" comparison itself is settled and retired from active
 *     generation to control cost; see git history if it needs to be re-run).
 *   - Round 2 (this file, issue #101): refines Shape B along two further axes Max asked to
 *     gate on evidence rather than decide by fiat:
 *       - Axis W (wind fields): speed only (`wind_kmh`) vs speed + gust (`wind_kmh` +
 *         `wind_gust_kmh`, from OGD `fu3010h0`/`fu3010h1`) — does the extra per-hour field
 *         measurably help/hurt small-model comprehension (the token-cost risk the Round 1
 *         result flagged)?
 *       - Axis C (daily container): the Round-1-measured "mixed" shape (temperature stays
 *         nested `{min,max,unit}`; precipitation/sunshine/wind summaries are flat scalars) vs
 *         "all-flat" (temperature also flattened to `temperature_min_c`/`temperature_max_c`).
 *     Run as ONE 2x2 factorial (not two separate single-axis runs) so the interaction between
 *     the axes is measured, not assumed independent — see `shapeBFixture`/`SHAPE_B_VARIANTS`.
 *     Also adds hourly temperature (`temperature_c`) to the per-hour object, which Round 1
 *     never modeled, and a small STATION mock (`stationMockFixture`) exercising Max's Q2
 *     ruling: station daily summaries keep MeteoSwiss's official aggregate rather than being
 *     derived from the hourly series, so `precipitation_total_mm` may legitimately NOT equal
 *     `sum(hourly precip_mm)` — the eval must recognize that as CORRECT model behavior for
 *     stations, not penalize it the way the postal-code cross-field questions do.
 */

import type { Expected } from "./questions.js";

const DATE = "2026-04-06";
const OFFSET = "+02:00";

/**
 * hour -> [precip_mm, sunshine_minutes, wind_kmh, temp_c, gust_kmh]. Hand-picked, not random —
 * see comments below. Every series has a unique (non-tied) extremum so "which hour" questions
 * have exactly one correct answer; a series' extremum hour MAY coincide with another series'
 * (e.g. the rain spell and the wind peak both land on hour 8 — see `ms-windy-dry-hour`'s
 * comment) — "unique" means unique-within-that-series, not disjoint across series.
 *
 * - Sunshine peaks at midday (unique max hour 12).
 * - Wind speed peaks during a morning gust (unique max hour 8); a short rain spell sits at
 *   07:00-08:00, so the wind max hour is also (deliberately) rainy.
 * - Temperature follows a diurnal curve: unique min overnight (hour 4), unique max mid-afternoon
 *   (hour 15) — one hour after the sunshine max, testing that models don't conflate the two.
 * - Gust exceeds wind speed every hour (physically required) and spikes at hour 9 — a squall
 *   immediately after the sustained-wind peak — giving gust a unique max hour distinct from
 *   wind speed's, so "strongest gust" and "strongest wind" have different correct answers.
 */
const HOURLY_TABLE: [number, number, number, number, number][] = [
  [0, 0, 5, 2.0, 8],
  [0, 0, 5, 1.5, 8],
  [0, 0, 5, 1.0, 8],
  [0, 0, 5, 0.5, 8],
  [0, 0, 5, 0.2, 8], // temp min (unique)
  [0, 0, 8, 0.8, 12],
  [0, 10, 10, 2.0, 15],
  [0.1, 5, 12, 4.0, 18],
  [0.2, 0, 15, 6.5, 22], // wind speed max (unique) — also rainy
  [0, 20, 12, 9.0, 35], // gust max (unique) — squall after the wind peak
  [0, 45, 10, 11.5, 16],
  [0, 55, 10, 13.5, 15],
  [0, 60, 8, 15.0, 13], // sunshine max (unique)
  [0, 58, 8, 16.5, 13],
  [0, 55, 10, 17.8, 16],
  [0, 40, 12, 18.5, 19], // temp max (unique)
  [0, 20, 14, 18.0, 21],
  [0, 10, 13, 16.5, 20],
  [0, 5, 12, 14.0, 18],
  [0, 0, 10, 11.0, 15],
  [0, 0, 8, 8.5, 12],
  [0, 0, 6, 6.0, 9],
  [0, 0, 5, 4.0, 8],
  [0, 0, 5, 2.8, 8],
];

export type HourlyRow = {
  hour: number;
  time: string;
  precipMm: number;
  sunshineMin: number;
  windKmh: number;
  tempC: number;
  gustKmh: number;
};

export function hourlyRows(): HourlyRow[] {
  return HOURLY_TABLE.map(
    ([precipMm, sunshineMin, windKmh, tempC, gustKmh], hour) => ({
      hour,
      time: `${DATE}T${String(hour).padStart(2, "0")}:00:00${OFFSET}`,
      precipMm,
      sunshineMin,
      windKmh,
      tempC,
      gustKmh,
    }),
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export const multiseriesGroundTruth = (() => {
  const rows = hourlyRows();
  const precipTotal = round1(rows.reduce((a, r) => a + r.precipMm, 0));
  const sunshineTotal = rows.reduce((a, r) => a + r.sunshineMin, 0);
  const windAvg = round1(rows.reduce((a, r) => a + r.windKmh, 0) / rows.length);
  const tempMin = round1(Math.min(...rows.map((r) => r.tempC)));
  const tempMax = round1(Math.max(...rows.map((r) => r.tempC)));
  const gustMax = round1(Math.max(...rows.map((r) => r.gustKmh)));
  const maxSunshineHour = rows.reduce((max, r) =>
    r.sunshineMin > max.sunshineMin ? r : max,
  ).hour;
  const maxWindHour = rows.reduce((max, r) =>
    r.windKmh > max.windKmh ? r : max,
  ).hour;
  const maxPrecipHour = rows.reduce((max, r) =>
    r.precipMm > max.precipMm ? r : max,
  ).hour;
  const maxTempHour = rows.reduce((max, r) =>
    r.tempC > max.tempC ? r : max,
  ).hour;
  const maxGustHour = rows.reduce((max, r) =>
    r.gustKmh > max.gustKmh ? r : max,
  ).hour;
  // "Best walk hour": dry AND some sunshine AND calm (wind < 10 km/h). Multiple hours can
  // qualify (they do, in this table) -- tie-break by most sunshine, derived not hand-typed.
  const walkCandidates = rows.filter(
    (r) => r.precipMm === 0 && r.sunshineMin > 0 && r.windKmh < 10,
  );
  if (walkCandidates.length === 0)
    throw new Error(
      "multiseries table has no hour satisfying the walk criteria",
    );
  const bestWalkHour = walkCandidates.reduce((max, r) =>
    r.sunshineMin > max.sunshineMin ? r : max,
  ).hour;
  // Existence + earliest-match question: dry AND windy (wind >= 14 km/h) -- deliberately
  // NOT the same hour as maxWindHour (which is rainy), to test the model isn't just pattern-
  // matching "the windy hour" without checking the dry condition too.
  const windyDryCandidates = rows.filter(
    (r) => r.precipMm === 0 && r.windKmh >= 14,
  );
  const windyDryExists = windyDryCandidates.length > 0;
  const windyDryHour = windyDryExists ? windyDryCandidates[0]!.hour : null;
  const h8 = rows.find((r) => r.hour === 8);
  const h13 = rows.find((r) => r.hour === 13);
  const h19 = rows.find((r) => r.hour === 19);
  if (!h8 || !h13 || !h19)
    throw new Error("multiseries table missing expected hours");
  return {
    precipTotal,
    sunshineTotal,
    windAvg,
    tempMin,
    tempMax,
    gustMax,
    maxSunshineHour,
    maxWindHour,
    maxPrecipHour,
    maxTempHour,
    maxGustHour,
    bestWalkHour,
    windyDryExists,
    windyDryHour,
    h8,
    h13,
    h19,
  };
})();

/**
 * The two axes Max asked to gate with evidence (issue #101):
 *   - includeGust: adds `wind_gust_kmh` to every hourly object and a `wind_gust_max_kmh` daily
 *     summary. When false, the hourly object and daily summary omit gust entirely (not
 *     `null` — the field doesn't exist in the payload, mirroring how a shipped "speed-only"
 *     decision would actually look).
 *   - flatTemperature: when true, `temperature_min_c`/`temperature_max_c` are top-level scalars
 *     — unit-suffixed like every other flat key (Max: "add unit suffixes to ALL keys") — (Max's
 *     "all-flat" ask); when false, temperature stays nested `{min,max,unit}` (the shape Round 1
 *     actually measured; the nested form doesn't need a key suffix since `unit` is already a
 *     sibling field). Every OTHER daily summary (precipitation/sunshine/wind) is flat in both
 *     cases — only temperature's nesting is under test.
 */
export type ShapeBVariant = { includeGust: boolean; flatTemperature: boolean };

export const SHAPE_B_VARIANTS: Record<string, ShapeBVariant> = {
  "b-mixed-nogust": { includeGust: false, flatTemperature: false },
  "b-mixed-gust": { includeGust: true, flatTemperature: false },
  "b-flat-nogust": { includeGust: false, flatTemperature: true },
  "b-flat-gust": { includeGust: true, flatTemperature: true },
};

type GroundTruth = typeof multiseriesGroundTruth;

/** Render one day's Shape-B object for the given variant, from the given rows/ground-truth —
 * shared by the postal-code mock (`shapeBFixture`) and the station mock
 * (`stationMockFixture`), which pass different rows/gt/declared-summaries. */
function renderDay(
  rows: HourlyRow[],
  variant: ShapeBVariant,
  summaries: {
    precipitationTotalMm: number;
    sunshineTotalMinutes: number;
    windAvgKmh: number;
    tempMin: number;
    tempMax: number;
    gustMax: number;
  },
): Record<string, unknown> {
  const hourly = rows.map((r) => {
    const entry: Record<string, unknown> = {
      time: r.time,
      temperature_c: r.tempC,
      precip_mm: r.precipMm,
      sunshine_minutes: r.sunshineMin,
      wind_kmh: r.windKmh,
    };
    if (variant.includeGust) entry.wind_gust_kmh = r.gustKmh;
    return entry;
  });

  const temperatureFields: Record<string, unknown> = variant.flatTemperature
    ? {
        temperature_min_c: summaries.tempMin,
        temperature_max_c: summaries.tempMax,
      }
    : {
        temperature: {
          min: summaries.tempMin,
          max: summaries.tempMax,
          unit: "°C",
        },
      };

  const day: Record<string, unknown> = {
    date: DATE,
    weather: "sunny intervals, light rain in the morning",
    weather_icon_url:
      "https://www.meteoschweiz.admin.ch/static/resources/weather-symbols/14.svg",
    ...temperatureFields,
    precipitation_total_mm: summaries.precipitationTotalMm,
    sunshine_total_minutes: summaries.sunshineTotalMinutes,
    wind_avg_kmh: summaries.windAvgKmh,
  };
  if (variant.includeGust) day.wind_gust_max_kmh = summaries.gustMax;
  day.hourly = hourly;
  return day;
}

/** Shape B (postal-code point): one unified `hourly[]` array of per-hour objects, daily
 * summaries all derived from the same hourly series (so total == sum(hourly) holds — the
 * cross-field invariant Round 1's `ms-cross-field` questions test). */
export function shapeBFixture(variant: ShapeBVariant): unknown {
  const rows = hourlyRows();
  const gt = multiseriesGroundTruth;
  return {
    location: {
      name: "Zürich",
      type: "postal_code",
      elevation: 409,
      coordinates: { lat: 47.372289, lon: 8.542189 },
    },
    generated: `${DATE}T04:00:00.000000Z`,
    forecast: [
      renderDay(rows, variant, {
        precipitationTotalMm: gt.precipTotal,
        sunshineTotalMinutes: gt.sunshineTotal,
        windAvgKmh: gt.windAvg,
        tempMin: gt.tempMin,
        tempMax: gt.tempMax,
        gustMax: gt.gustMax,
      }),
    ],
    source: "MeteoSwiss Open Data",
  };
}

/**
 * Station mock — exercises Max's Q2 ruling (issue #101): weather stations keep MeteoSwiss's
 * OFFICIAL daily aggregate for precipitation (their own `rka150d0` product) rather than one
 * derived from re-summing the hourly series (`rre150h0`), so `precipitation_total_mm` can
 * legitimately diverge from `sum(hourly precip_mm)`. Uses the first 12 hours of the same
 * canonical table (rows 0-11) but declares an official total (2.3mm) that does NOT equal the
 * hourly sum of that slice — deliberately, to test that models recognize a real, expected
 * mismatch rather than reporting `matches_hourly_sum: true` by pattern-matching on the postal
 * behavior, or flagging the data as inconsistent/broken. Rendered once, at a single
 * representative variant (flat container, no gust) — this mock tests a Q2 semantics question,
 * not the Q1/Q3 axes, so it doesn't need to run across all four variants.
 */
export function stationMockFixture(): unknown {
  const rows = hourlyRows().slice(0, 12);
  const hourlySum = round1(rows.reduce((a, r) => a + r.precipMm, 0));
  const officialTotal = 2.3;
  if (officialTotal === hourlySum) {
    throw new Error(
      "station mock's official total must differ from the hourly sum to exercise the relaxed invariant",
    );
  }
  const variant: ShapeBVariant = { includeGust: false, flatTemperature: true };
  const tempMin = round1(Math.min(...rows.map((r) => r.tempC)));
  const tempMax = round1(Math.max(...rows.map((r) => r.tempC)));
  const windAvg = round1(rows.reduce((a, r) => a + r.windKmh, 0) / rows.length);
  const sunshineTotal = rows.reduce((a, r) => a + r.sunshineMin, 0);
  return {
    location: {
      name: "Napf",
      type: "station",
      elevation: 1408,
      coordinates: { lat: 47.0088, lon: 7.9436 },
    },
    generated: `${DATE}T04:00:00.000000Z`,
    forecast: [
      renderDay(rows, variant, {
        precipitationTotalMm: officialTotal,
        sunshineTotalMinutes: sunshineTotal,
        windAvgKmh: windAvg,
        tempMin,
        tempMax,
        gustMax: 0,
      }),
    ],
    source: "MeteoSwiss Open Data",
  };
}
/** Ground truth for the station mock, exported so questions/tests don't hand-recompute it. */
export const stationMockGroundTruth = (() => {
  const rows = hourlyRows().slice(0, 12);
  return {
    hourlySum: round1(rows.reduce((a, r) => a + r.precipMm, 0)),
    officialTotal: 2.3,
  };
})();

const ANSWER_INSTRUCTION =
  "Respond with ONLY a single-line strict JSON object in the exact schema given — no markdown fences, no explanation, no extra keys.";

export type MultiseriesQuestion = {
  id: string;
  family: string;
  promptText: string;
  expected: Expected;
};

/** The gust question is conditioned on the variant: when gust IS in the payload, ask an
 * argmax question (a real, answerable fact); when gust is NOT in the payload, ask the same
 * "peak gust" question but expect the model to DECLINE rather than fabricate a number —
 * reusing the `unavailable` leaf kind (see scoring-core.ts) the same way `stationQuestion`
 * does for precipitation. This doubles as a hallucination check for the no-gust variants. */
function gustQuestion(
  variant: ShapeBVariant,
  gt: GroundTruth,
): MultiseriesQuestion {
  if (variant.includeGust) {
    return {
      id: "ms-argmax-gust",
      family: "ms-argmax",
      promptText: `Which single local hour on ${DATE} has the strongest wind gust? ${ANSWER_INSTRUCTION} Schema: {"hour": "HH:00"}`,
      expected: { key: "hour", kind: "hour", value: gt.maxGustHour },
    };
  }
  return {
    id: "ms-gust-unavailable",
    family: "null-handling",
    promptText: `What is the peak wind gust speed in km/h on ${DATE}? If gust data is not present in this data, say so explicitly instead of guessing a number. ${ANSWER_INSTRUCTION} Schema: {"gust_available": true, "gust_kmh": <number>} or {"gust_available": false}`,
    expected: { key: "gust_available", kind: "unavailable" },
  };
}

/** The 11 Round-1 cross-series questions plus Round-2 additions (hourly temperature, gust —
 * see `gustQuestion`), run identically against all four `SHAPE_B_VARIANTS`. */
export function multiseriesQuestions(
  variant: ShapeBVariant,
): MultiseriesQuestion[] {
  const gt = multiseriesGroundTruth;
  return [
    {
      id: "ms-point-cross",
      family: "ms-point-cross",
      promptText: `At 08:00 local time on ${DATE}: is it raining, and what is the wind speed in km/h? ${ANSWER_INSTRUCTION} Schema: {"raining": true | false, "wind_kmh": <number>}`,
      expected: {
        kind: "compound",
        parts: [
          { key: "raining", kind: "bool", value: gt.h8.precipMm > 0 },
          {
            key: "wind_kmh",
            kind: "number",
            value: gt.h8.windKmh,
            tolerance: 0.5,
          },
        ],
      },
    },
    {
      id: "ms-argmax-sunshine",
      family: "ms-argmax",
      promptText: `Which single local hour on ${DATE} has the most sunshine? ${ANSWER_INSTRUCTION} Schema: {"hour": "HH:00"}`,
      expected: { key: "hour", kind: "hour", value: gt.maxSunshineHour },
    },
    {
      id: "ms-argmax-wind",
      family: "ms-argmax",
      promptText: `Which single local hour on ${DATE} has the highest wind speed? ${ANSWER_INSTRUCTION} Schema: {"hour": "HH:00"}`,
      expected: { key: "hour", kind: "hour", value: gt.maxWindHour },
    },
    {
      id: "ms-compound-1300",
      family: "ms-point-cross",
      promptText: `At 13:00 local time on ${DATE}: is it dry, is there any sunshine, and is it calm (wind under 10 km/h)? ${ANSWER_INSTRUCTION} Schema: {"dry": true | false, "sunny": true | false, "calm": true | false}`,
      expected: {
        kind: "compound",
        parts: [
          { key: "dry", kind: "bool", value: gt.h13.precipMm === 0 },
          { key: "sunny", kind: "bool", value: gt.h13.sunshineMin > 0 },
          { key: "calm", kind: "bool", value: gt.h13.windKmh < 10 },
        ],
      },
    },
    {
      id: "ms-sunshine-total",
      family: "ms-cross-field",
      promptText: `What is the total sunshine in minutes for ${DATE}, and does it match summing the hourly sunshine series (allow rounding)? ${ANSWER_INSTRUCTION} Schema: {"total_minutes": <number>, "matches_hourly_sum": true | false}`,
      expected: {
        kind: "compound",
        parts: [
          {
            key: "total_minutes",
            kind: "number",
            value: gt.sunshineTotal,
            tolerance: 1,
          },
          { key: "matches_hourly_sum", kind: "bool", value: true },
        ],
      },
    },
    {
      id: "ms-argmax-precip",
      family: "ms-argmax",
      promptText: `Which single local hour on ${DATE} has the most rainfall? ${ANSWER_INSTRUCTION} Schema: {"hour": "HH:00"}`,
      expected: { key: "hour", kind: "hour", value: gt.maxPrecipHour },
    },
    {
      id: "ms-best-walk-hour",
      family: "ms-compound-argmax",
      promptText: `Which single local hour on ${DATE} is BEST for a walk: it must be dry (0mm rain), have some sunshine (more than 0 minutes), and be calm (wind under 10 km/h)? If more than one hour qualifies, pick the one with the most sunshine. ${ANSWER_INSTRUCTION} Schema: {"hour": "HH:00"}`,
      expected: { key: "hour", kind: "hour", value: gt.bestWalkHour },
    },
    {
      id: "ms-windy-dry-hour",
      family: "ms-existence",
      promptText: `Is there a local hour on ${DATE} that is both completely dry (0mm rain) AND has wind of at least 14 km/h? If yes, give the earliest such hour; if no, say so. ${ANSWER_INSTRUCTION} Schema: {"exists": true | false, "hour": "HH:00"}`,
      expected: {
        kind: "compound",
        parts: [
          { key: "exists", kind: "bool", value: gt.windyDryExists },
          { key: "hour", kind: "hour", value: gt.windyDryHour ?? -1 },
        ],
      },
    },
    {
      id: "ms-point-1900",
      family: "ms-point-cross",
      promptText: `At 19:00 local time on ${DATE}: is it dry, is there any sunshine, and is it windy (wind at or above 10 km/h)? ${ANSWER_INSTRUCTION} Schema: {"dry": true | false, "sunny": true | false, "windy": true | false}`,
      expected: {
        kind: "compound",
        parts: [
          { key: "dry", kind: "bool", value: gt.h19.precipMm === 0 },
          { key: "sunny", kind: "bool", value: gt.h19.sunshineMin > 0 },
          { key: "windy", kind: "bool", value: gt.h19.windKmh >= 10 },
        ],
      },
    },
    {
      id: "ms-wind-avg-check",
      family: "ms-cross-field",
      promptText: `What is the average wind speed in km/h for ${DATE}, and does it match averaging the hourly wind series (allow rounding)? ${ANSWER_INSTRUCTION} Schema: {"avg_kmh": <number>, "matches_hourly_avg": true | false}`,
      expected: {
        kind: "compound",
        parts: [
          { key: "avg_kmh", kind: "number", value: gt.windAvg, tolerance: 0.5 },
          { key: "matches_hourly_avg", kind: "bool", value: true },
        ],
      },
    },
    {
      id: "ms-precip-total-check",
      family: "ms-cross-field",
      promptText: `What is the total precipitation in mm for ${DATE}, and does it match summing the hourly precipitation series (allow rounding)? ${ANSWER_INSTRUCTION} Schema: {"total_mm": <number>, "matches_hourly_sum": true | false}`,
      expected: {
        kind: "compound",
        parts: [
          {
            key: "total_mm",
            kind: "number",
            value: gt.precipTotal,
            tolerance: 0.05,
          },
          { key: "matches_hourly_sum", kind: "bool", value: true },
        ],
      },
    },
    {
      id: "ms-argmax-temp",
      family: "ms-argmax",
      promptText: `Which single local hour on ${DATE} has the highest temperature? ${ANSWER_INSTRUCTION} Schema: {"hour": "HH:00"}`,
      expected: { key: "hour", kind: "hour", value: gt.maxTempHour },
    },
    {
      id: "ms-temp-max-check",
      family: "ms-cross-field",
      promptText: `What is the maximum temperature in °C for ${DATE}, and does it match the highest reading in the hourly temperature series (allow rounding)? ${ANSWER_INSTRUCTION} Schema: {"max_c": <number>, "matches_hourly_max": true | false}`,
      expected: {
        kind: "compound",
        parts: [
          { key: "max_c", kind: "number", value: gt.tempMax, tolerance: 0.5 },
          { key: "matches_hourly_max", kind: "bool", value: true },
        ],
      },
    },
    gustQuestion(variant, gt),
  ];
}

/** The single station-mock question (see `stationMockFixture`): the model must recognize that
 * for a STATION, the declared daily total legitimately does NOT match the hourly sum — the
 * opposite of the postal-code `ms-precip-total-check` expectation — because stations keep
 * MeteoSwiss's official daily aggregate rather than a hourly-derived one (Max's Q2 ruling). */
export function stationMockQuestion(): MultiseriesQuestion {
  const gt = stationMockGroundTruth;
  return {
    id: "ms-station-total-mismatch",
    family: "ms-cross-field",
    promptText: `What is the declared daily precipitation total (mm) for ${DATE}, and does it exactly match summing this location's hourly precipitation readings? ${ANSWER_INSTRUCTION} Schema: {"total_mm": <number>, "matches_hourly_sum": true | false}`,
    expected: {
      kind: "compound",
      parts: [
        {
          key: "total_mm",
          kind: "number",
          value: gt.officialTotal,
          tolerance: 0.05,
        },
        // Correct answer is FALSE here — the opposite of the postal-code cross-field
        // questions above — because this is a station's official daily aggregate, not a
        // value derived from the shown hourly series.
        { key: "matches_hourly_sum", kind: "bool", value: false },
      ],
    },
  };
}
