/**
 * Secondary track (per PLAN.md "Multi-series mock"): a hand-authored MOCK of a *hypothetical*
 * future forecast shape that combines hourly precipitation + sunshine + wind — the next
 * features on the roadmap (see CLAUDE.md "Open Tasks"). This does NOT reflect anything
 * `meteoswiss-mcp` emits today; it exists purely to compare two candidate container shapes
 * before that feature is built, so the shape choice has evidence behind it.
 *
 * Kept clearly subordinate to the UTC-vs-local gate: one day, one small hourly table, 5
 * questions, run across a small model slice — not folded into the primary question set.
 *
 * Both shapes below are rendered from the SAME canonical HOURLY table, so their ground truth
 * is identical by construction — only the container shape differs:
 *   - Shape A ("parallel arrays"): precipitation.hourly / sunshine.hourly / wind.hourly,
 *     each an independent { time, value } series (mirrors today's precipitation.hourly shape,
 *     repeated per parameter).
 *   - Shape B ("unified per-hour objects"): one hourly[] array of { time, precip_mm,
 *     sunshine_minutes, wind_kmh } objects — one entry per hour, all three parameters together.
 */

import type { Expected } from "./questions.js";

const DATE = "2026-04-06";
const OFFSET = "+02:00";

/** hour -> [precip_mm, sunshine_minutes, wind_kmh]. Hand-picked, not random — see table below.
 * Sunshine peaks at midday (unique max hour 12); wind peaks during a morning gust (unique max
 * hour 8); a short rain spell sits at 07:00-08:00. Every extremum is unique on purpose so the
 * "which hour" questions have one unquestionably correct answer. */
const HOURLY_TABLE: [number, number, number][] = [
  [0, 0, 5],
  [0, 0, 5],
  [0, 0, 5],
  [0, 0, 5],
  [0, 0, 5],
  [0, 0, 8],
  [0, 10, 10],
  [0.1, 5, 12],
  [0.2, 0, 15],
  [0, 20, 12],
  [0, 45, 10],
  [0, 55, 10],
  [0, 60, 8],
  [0, 58, 8],
  [0, 55, 10],
  [0, 40, 12],
  [0, 20, 14],
  [0, 10, 13],
  [0, 5, 12],
  [0, 0, 10],
  [0, 0, 8],
  [0, 0, 6],
  [0, 0, 5],
  [0, 0, 5],
];

export type HourlyRow = {
  hour: number;
  time: string;
  precipMm: number;
  sunshineMin: number;
  windKmh: number;
};

export function hourlyRows(): HourlyRow[] {
  return HOURLY_TABLE.map(([precipMm, sunshineMin, windKmh], hour) => ({
    hour,
    time: `${DATE}T${String(hour).padStart(2, "0")}:00:00${OFFSET}`,
    precipMm,
    sunshineMin,
    windKmh,
  }));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export const multiseriesGroundTruth = (() => {
  const rows = hourlyRows();
  const precipTotal = round1(rows.reduce((a, r) => a + r.precipMm, 0));
  const sunshineTotal = rows.reduce((a, r) => a + r.sunshineMin, 0);
  const windAvg = round1(rows.reduce((a, r) => a + r.windKmh, 0) / rows.length);
  const maxSunshineHour = rows.reduce((max, r) =>
    r.sunshineMin > max.sunshineMin ? r : max,
  ).hour;
  const maxWindHour = rows.reduce((max, r) =>
    r.windKmh > max.windKmh ? r : max,
  ).hour;
  const h8 = rows.find((r) => r.hour === 8);
  const h13 = rows.find((r) => r.hour === 13);
  if (!h8 || !h13) throw new Error("multiseries table missing expected hours");
  return {
    precipTotal,
    sunshineTotal,
    windAvg,
    maxSunshineHour,
    maxWindHour,
    h8,
    h13,
  };
})();

/** Shape A: one parallel { time, value } array per parameter (mirrors today's precipitation.hourly). */
export function shapeAFixture(): unknown {
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
      {
        date: DATE,
        weather: "sunny intervals, light rain in the morning",
        weather_icon_url:
          "https://www.meteoschweiz.admin.ch/static/resources/weather-symbols/14.svg",
        temperature: { min: 8, max: 17, unit: "°C" },
        precipitation: {
          total: gt.precipTotal,
          unit: "mm",
          hourly: rows.map((r) => ({ time: r.time, value: r.precipMm })),
        },
        sunshine: {
          total_minutes: gt.sunshineTotal,
          hourly: rows.map((r) => ({ time: r.time, value: r.sunshineMin })),
        },
        wind: {
          avg_kmh: gt.windAvg,
          hourly: rows.map((r) => ({ time: r.time, value: r.windKmh })),
        },
      },
    ],
    source: "MeteoSwiss Open Data",
  };
}

/** Shape B: one unified hourly[] array of per-hour objects carrying all three parameters. */
export function shapeBFixture(): unknown {
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
      {
        date: DATE,
        weather: "sunny intervals, light rain in the morning",
        weather_icon_url:
          "https://www.meteoschweiz.admin.ch/static/resources/weather-symbols/14.svg",
        temperature: { min: 8, max: 17, unit: "°C" },
        precipitation_total_mm: gt.precipTotal,
        sunshine_total_minutes: gt.sunshineTotal,
        wind_avg_kmh: gt.windAvg,
        hourly: rows.map((r) => ({
          time: r.time,
          precip_mm: r.precipMm,
          sunshine_minutes: r.sunshineMin,
          wind_kmh: r.windKmh,
        })),
      },
    ],
    source: "MeteoSwiss Open Data",
  };
}

const ANSWER_INSTRUCTION =
  "Respond with ONLY a single-line strict JSON object in the exact schema given — no markdown fences, no explanation, no extra keys.";

export type MultiseriesQuestion = {
  id: string;
  family: string;
  promptText: string;
  expected: Expected;
};

/** The 5 cross-series questions, run identically against both shapes. */
export function multiseriesQuestions(): MultiseriesQuestion[] {
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
  ];
}
