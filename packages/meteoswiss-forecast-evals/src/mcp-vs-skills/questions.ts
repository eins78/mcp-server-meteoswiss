/**
 * The MCP-vs-skills question set: 12 real-world Swiss weather questions covering the
 * MCP server's whole tool surface (current weather, forecasts, pollen, stations,
 * climate). Every expected answer is COMPUTED from live data captured by
 * capture-ground-truth.ts — never hand-typed (suite rule).
 *
 * Time-reference rule: questions embed absolute dates ("on Saturday, 2026-07-12")
 * computed at capture time, never relative words like "tomorrow" — a capture-vs-run
 * straddling midnight must not shift a question's meaning.
 */

import type { Expected } from "./scoring-model.js";
import {
  dayField,
  minTempInWindow,
  precipInWindow,
  weekendDates,
  type ForecastDay,
} from "./ground-truth-live.js";

export type QuestionFamily =
  "current" | "forecast" | "pollen" | "stations" | "climate";

/** Everything capture-ground-truth.ts gathers before evaluating the questions. */
export type GroundTruthContext = {
  capturedAt: Date;
  /** station_abbr -> VQHA80 parameter -> value. */
  current: Map<string, Record<string, number | null>>;
  /** station_abbr -> full name (SMN metadata, UTF-8). */
  stationNames: Map<string, string>;
  /** Stations in canton GR (from the MCP stations tool — covers both networks). */
  grStations: Array<{ abbr: string; name: string }>;
  /** city key -> forecast days (captured via the MCP server). */
  forecasts: Map<string, ForecastDay[]>;
  /** pollen station (lowercase abbr) -> canonical species -> particles/m³. */
  pollen: Map<string, Record<string, number | null>>;
  /** 'YYYY-MM' -> monthly mean temp for Zürich/Fluntern (NBCN). */
  climateZurichMonthly: Map<string, number>;
};

export type QuestionDef = {
  id: string;
  family: QuestionFamily;
  question: (ctx: GroundTruthContext) => string;
  /** Shown verbatim to the model as the FINAL_JSON schema. */
  schemaHint: string;
  computeExpected: (ctx: GroundTruthContext) => Expected;
};

function currentValue(
  ctx: GroundTruthContext,
  station: string,
  param: string,
): number {
  const value = ctx.current.get(station)?.[param];
  if (value === undefined || value === null) {
    throw new Error(`no current ${param} for station ${station}`);
  }
  return value;
}

function pollenValue(
  ctx: GroundTruthContext,
  station: string,
  species: string,
): number {
  const value = ctx.pollen.get(station)?.[species];
  if (value === undefined || value === null) {
    throw new Error(`no pollen ${species} value for ${station}`);
  }
  return value;
}

function forecastDays(ctx: GroundTruthContext, city: string): ForecastDay[] {
  const days = ctx.forecasts.get(city);
  if (days === undefined) {
    throw new Error(`no forecast captured for ${city}`);
  }
  return days;
}

function saturday(ctx: GroundTruthContext): string {
  return weekendDates(ctx.capturedAt).saturday;
}

function sunday(ctx: GroundTruthContext): string {
  return weekendDates(ctx.capturedAt).sunday;
}

export const QUESTIONS: QuestionDef[] = [
  {
    id: "current-temp-zurich",
    family: "current",
    question: () =>
      "What is the current air temperature in Zürich (station Zürich / Fluntern)?",
    schemaHint: '{"temperature_c": <number>}',
    computeExpected: (ctx) => ({
      fields: {
        temperature_c: {
          kind: "number",
          value: currentValue(ctx, "SMA", "tre200s0"),
          // Live value refreshes every 10 min between capture and answer.
          tolerance: 1.5,
        },
      },
    }),
  },
  {
    id: "current-wind-saentis",
    family: "current",
    question: () =>
      "What is the current average wind speed on Säntis (the 10-minute mean, not gusts)?",
    schemaHint: '{"wind_kmh": <number>}',
    computeExpected: (ctx) => {
      const value = currentValue(ctx, "SAE", "fu3010z0");
      return {
        fields: {
          wind_kmh: {
            kind: "number",
            value,
            // Mountain wind swings hard between 10-min updates.
            tolerance: Math.max(6, value * 0.5),
          },
        },
      };
    },
  },
  {
    id: "current-warmest-station",
    family: "current",
    question: () =>
      "Which MeteoSwiss weather station reports the highest air temperature right now? Give the station name.",
    schemaHint: '{"station": "<station name>"}',
    computeExpected: (ctx) => {
      let max = Number.NEGATIVE_INFINITY;
      for (const values of ctx.current.values()) {
        const t = values["tre200s0"];
        if (t !== undefined && t !== null && t > max) {
          max = t;
        }
      }
      if (!Number.isFinite(max)) {
        throw new Error("no temperatures in current-weather data");
      }
      // Any station within 0.7 °C of the max is accepted — ranks near the top can
      // swap between the capture and the model's own fetch.
      const accepted: string[] = [];
      for (const [abbr, values] of ctx.current.entries()) {
        const t = values["tre200s0"];
        if (t !== undefined && t !== null && t >= max - 0.7) {
          accepted.push(abbr);
          const name = ctx.stationNames.get(abbr);
          if (name !== undefined) {
            accepted.push(name);
          }
        }
      }
      return { fields: { station: { kind: "oneof", accepted } } };
    },
  },
  {
    id: "forecast-rain-saturday-zurich",
    family: "forecast",
    question: (ctx) =>
      `Will it rain in Zürich on Saturday (${saturday(ctx)}) between 12:00 and 18:00 local time?`,
    schemaHint: '{"will_rain": <true|false>}',
    computeExpected: (ctx) => ({
      fields: {
        will_rain: {
          kind: "boolean",
          value:
            precipInWindow(forecastDays(ctx, "zurich"), saturday(ctx), 12, 18) >
            0.1,
        },
      },
    }),
  },
  {
    id: "forecast-low-bern",
    family: "forecast",
    question: (ctx) =>
      `How cold will it get in Bern in the early morning of ${saturday(ctx)} (between 00:00 and 08:00 local time)? Give the minimum temperature.`,
    schemaHint: '{"min_temperature_c": <number>}',
    computeExpected: (ctx) => ({
      fields: {
        min_temperature_c: {
          kind: "number",
          value: minTempInWindow(
            forecastDays(ctx, "bern"),
            saturday(ctx),
            0,
            8,
          ),
          tolerance: 1.5,
        },
      },
    }),
  },
  {
    id: "forecast-jacket-basel",
    family: "forecast",
    question: (ctx) =>
      `What is the forecast maximum temperature in Basel on Saturday (${saturday(ctx)}), and would you recommend taking a jacket for the afternoon?`,
    schemaHint:
      '{"max_temperature_c": <number>, "jacket_recommended": <true|false>}',
    computeExpected: (ctx) => {
      const tMax = dayField(forecastDays(ctx, "basel"), saturday(ctx), "tMax");
      return {
        fields: {
          max_temperature_c: { kind: "number", value: tMax, tolerance: 1.5 },
          // Clear-cut cases are graded; the 15–22 °C gray zone accepts either call.
          jacket_recommended:
            tMax < 15
              ? { kind: "boolean", value: true }
              : tMax > 22
                ? { kind: "boolean", value: false }
                : { kind: "any" },
        },
      };
    },
  },
  {
    id: "forecast-weekend-lugano",
    family: "forecast",
    question: (ctx) =>
      `What are the forecast maximum temperatures in Lugano for the weekend (Saturday ${saturday(ctx)} and Sunday ${sunday(ctx)})?`,
    schemaHint: '{"saturday_max_c": <number>, "sunday_max_c": <number>}',
    computeExpected: (ctx) => ({
      fields: {
        saturday_max_c: {
          kind: "number",
          value: dayField(forecastDays(ctx, "lugano"), saturday(ctx), "tMax"),
          tolerance: 2,
        },
        sunday_max_c: {
          kind: "number",
          value: dayField(forecastDays(ctx, "lugano"), sunday(ctx), "tMax"),
          tolerance: 2,
        },
      },
    }),
  },
  {
    id: "forecast-sunshine-geneva",
    family: "forecast",
    question: (ctx) =>
      `How many hours of sunshine are forecast for Geneva on Sunday (${sunday(ctx)})?`,
    schemaHint: '{"sunshine_hours": <number>}',
    computeExpected: (ctx) => ({
      fields: {
        sunshine_hours: {
          kind: "number",
          value:
            dayField(
              forecastDays(ctx, "geneva"),
              sunday(ctx),
              "sunshineTotalMin",
            ) / 60,
          tolerance: 1.5,
        },
      },
    }),
  },
  {
    id: "pollen-grasses-zurich",
    family: "pollen",
    question: () =>
      "According to the most recent daily measurement, what is the grass pollen concentration in Zürich, in particles per cubic metre?",
    schemaHint: '{"grass_pollen_per_m3": <number>}',
    computeExpected: (ctx) => {
      const value = pollenValue(ctx, "pzh", "grasses");
      return {
        fields: {
          grass_pollen_per_m3: {
            kind: "number",
            value,
            tolerance: Math.max(5, value * 0.2),
          },
        },
      };
    },
  },
  {
    id: "pollen-types-basel",
    family: "pollen",
    question: () =>
      "Which of the seven measured pollen types show a nonzero concentration in the most recent daily measurement for Basel?",
    schemaHint: '{"pollen_types": ["<type>", ...]}',
    computeExpected: (ctx) => {
      const readings = ctx.pollen.get("pbs");
      if (readings === undefined) {
        throw new Error("no pollen data for Basel (pbs)");
      }
      const expected = Object.entries(readings)
        .filter(([, value]) => value !== null && value > 0)
        .map(([species]) => species);
      return { fields: { pollen_types: { kind: "set-match", expected } } };
    },
  },
  {
    id: "stations-graubuenden",
    family: "stations",
    question: () =>
      "Name three MeteoSwiss automatic weather stations located in canton Graubünden.",
    schemaHint: '{"stations": ["<name>", "<name>", "<name>"]}',
    computeExpected: (ctx) => {
      if (ctx.grStations.length === 0) {
        throw new Error("no GR stations captured");
      }
      const universe = ctx.grStations.flatMap((s) => [s.abbr, s.name]);
      return {
        fields: {
          stations: { kind: "subset-of", universe, minCount: 3 },
        },
      };
    },
  },
  {
    id: "climate-june-zurich",
    family: "climate",
    question: () =>
      "What was the monthly mean air temperature at Zürich / Fluntern in June 2026, according to the MeteoSwiss climate series?",
    schemaHint: '{"mean_temperature_c": <number>}',
    computeExpected: (ctx) => {
      const value = ctx.climateZurichMonthly.get("2026-06");
      if (value === undefined) {
        throw new Error("June 2026 missing from NBCN monthly series");
      }
      return {
        fields: {
          mean_temperature_c: { kind: "number", value, tolerance: 0.3 },
        },
      };
    },
  },
];
