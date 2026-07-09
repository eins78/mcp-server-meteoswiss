#!/usr/bin/env -S node --import tsx
/**
 * One-off, deterministic generator for fixtures/forecast-8001-7day-local.json.
 *
 * WHY THIS EXISTS: meteoswiss-mcp's test fixtures (packages/meteoswiss-mcp/test/__fixtures__)
 * only cover ~1.5 days of hourly data, which is what forecast-8001-2day-local.json (the
 * *real*, captured-from-the-tool primary fixture) is built from. There is no fixture data
 * long enough to *capture* a realistic 7-day forecast the same way. Per ../docs/spec.md ("Fixture &
 * the two variants"), a longer-horizon fixture is needed to test whether legibility holds up
 * over a longer series (a proxy for "will consumers still cope once we add more time-series
 * over more days") — so this day's data is synthesized instead of captured.
 *
 * Deliberately NOT random (no Math.random/Date.now): every day's hourly rain profile is one
 * of four fixed, hand-picked, reviewable patterns below, assigned by day index. This keeps
 * the fixture reproducible and lets a reader verify "wettest day" / "driest day" ground truth
 * by eye without re-running anything.
 *
 * Starts 2026-04-06 (a Monday, safely after the 2026-03-29 CET->CEST transition covered by
 * the primary fixture) so this fixture stays in constant +02:00 offset throughout — the DST
 * edge case is already exercised by forecast-8001-2day-local.json; this fixture's job is
 * series *length*, not DST.
 *
 * Run (from the package root, where node_modules/tsx is installed):
 *   node --import tsx scripts/synth-7day-fixture.ts   (writes fixtures/forecast-8001-7day-local.json)
 * Uses the package's own pinned `tsx` devDependency via Node's --import, not `npx`, so no
 * unpinned tsx version can be fetched over the network.
 */

import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { DailyForecast, LocalForecastResponse } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(
  __dirname,
  "../fixtures/forecast-8001-7day-local.json",
);

const START_DATE = "2026-04-06"; // Monday, constant +02:00 (CEST) throughout the week
const OFFSET = "+02:00";

type HourlyProfile = number[];

// Hourly rain profiles (mm), one per 24-hour day, index = hour 0-23. Hand-picked, not random.
const DRY: HourlyProfile = new Array(24).fill(0);
const MORNING_DRIZZLE: HourlyProfile = DRY.map((_, h) =>
  h >= 6 && h <= 8 ? [0.1, 0.2, 0.1][h - 6]! : 0,
);
const AFTERNOON_SHOWER: HourlyProfile = DRY.map((_, h) =>
  h >= 14 && h <= 17 ? [0.2, 0.6, 0.4, 0.1][h - 14]! : 0,
);
const ALL_DAY_RAIN: HourlyProfile = DRY.map((_, h) =>
  h >= 5 && h <= 21 ? 0.3 : 0,
);

// One profile per day of the week (Mon..Sun), chosen for variety incl. a clear single wettest day.
const DAY_PROFILES: HourlyProfile[] = [
  DRY, // Mon 04-06
  MORNING_DRIZZLE, // Tue 04-07
  DRY, // Wed 04-08
  ALL_DAY_RAIN, // Thu 04-09 -- the wettest day (17 * 0.3 = 5.1mm)
  AFTERNOON_SHOWER, // Fri 04-10
  DRY, // Sat 04-11
  DRY, // Sun 04-12
];

const WEATHER_BY_PROFILE = new Map<
  HourlyProfile,
  { weather: string; icon: number }
>([
  [DRY, { weather: "sunny", icon: 1 }],
  [MORNING_DRIZZLE, { weather: "rain showers", icon: 25 }],
  [ALL_DAY_RAIN, { weather: "rain", icon: 22 }],
  [AFTERNOON_SHOWER, { weather: "sunny intervals, rain showers", icon: 25 }],
]);

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const forecast: DailyForecast[] = DAY_PROFILES.map((profile, dayIndex) => {
  const date = addDays(START_DATE, dayIndex);
  const hourly = profile.map((value, hour) => ({
    time: `${date}T${String(hour).padStart(2, "0")}:00:00${OFFSET}`,
    value,
  }));
  const total = round1(profile.reduce((a, b) => a + b, 0));
  const meta = WEATHER_BY_PROFILE.get(profile);
  if (!meta)
    throw new Error(
      "unreachable: every profile has a WEATHER_BY_PROFILE entry",
    );
  return {
    date,
    weather: meta.weather,
    weather_icon_url: `https://www.meteoschweiz.admin.ch/static/resources/weather-symbols/${meta.icon}.svg`,
    temperature: { min: 6 + dayIndex, max: 16 + dayIndex, unit: "°C" },
    precipitation: { total, unit: "mm", hourly },
  };
});

const fixture: LocalForecastResponse = {
  location: {
    name: "Zürich",
    type: "postal_code",
    elevation: 409,
    coordinates: { lat: 47.372289, lon: 8.542189 },
  },
  generated: `${START_DATE}T04:00:00.000000Z`,
  forecast,
  source: "MeteoSwiss Open Data",
};

writeFileSync(OUT_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${OUT_PATH}`);
