/**
 * Ground truth for the programmatic question set, computed once from the LOCAL fixture
 * and reused unchanged for both the LOCAL and UTC prompt variants (see fixture.ts). This
 * is what makes scoring deterministic: the correct answer is derived from the same data
 * the model is shown, never hand-typed.
 *
 * Non-obvious finding while building this: the JSON's own day-level `date` grouping is
 * the UTC calendar date the hourly readings were fetched under (see
 * `groupPrecipByDate`/`timestampToDate` in packages/meteoswiss-mcp/src/data/ogd-local-forecast.ts),
 * NOT the local calendar date. Concretely, in the captured DST fixture, the day object dated
 * "2026-03-28" contains an hourly entry timestamped "2026-03-29T00:00:00+01:00" — a reading
 * that is, in local wall-clock terms, already the next day. A naive reader who assumes
 * "day.date's hourly[] are that local day's hours" will misattribute that last entry.
 * To keep ground truth unambiguous, this module ignores the JSON's day-level grouping
 * entirely and re-buckets every hourly reading by its OWN parsed local calendar date.
 */

import type { LocalForecastResponse } from "./types.js";

export type CanonicalReading = {
  utcInstant: Date;
  /** Local (Europe/Zurich) calendar date, YYYY-MM-DD — derived from the reading's own instant. */
  localDate: string;
  /** Local (Europe/Zurich) wall-clock hour, 0-23. */
  localHour: number;
  /** UTC offset at this instant, e.g. "+01:00" or "+02:00". */
  localOffset: string;
  value: number;
};

const zurichFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Zurich",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  timeZoneName: "longOffset",
});

function zurichParts(instant: Date): {
  date: string;
  hour: number;
  offset: string;
} {
  const parts = zurichFormatter.formatToParts(instant);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const offset = get("timeZoneName").replace("GMT", "") || "+00:00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    offset,
  };
}

/** Flatten every hourly precipitation reading across all days into one chronological list. */
export function canonicalReadings(
  fixture: LocalForecastResponse,
): CanonicalReading[] {
  const readings: CanonicalReading[] = [];
  for (const day of fixture.forecast) {
    if (day.precipitation.hourly === null) continue;
    for (const h of day.precipitation.hourly) {
      const instant = new Date(h.time);
      const { date, hour, offset } = zurichParts(instant);
      readings.push({
        utcInstant: instant,
        localDate: date,
        localHour: hour,
        localOffset: offset,
        value: h.value,
      });
    }
  }
  readings.sort((a, b) => a.utcInstant.getTime() - b.utcInstant.getTime());
  return readings;
}

/** Local calendar dates present in the readings, in chronological order (deduplicated). */
export function localDatesInOrder(readings: CanonicalReading[]): string[] {
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const r of readings) {
    if (!seen.has(r.localDate)) {
      seen.add(r.localDate);
      dates.push(r.localDate);
    }
  }
  return dates;
}

function readingAt(
  readings: CanonicalReading[],
  date: string,
  hour: number,
): CanonicalReading | undefined {
  return readings.find((r) => r.localDate === date && r.localHour === hour);
}

export function valueAt(
  readings: CanonicalReading[],
  date: string,
  hour: number,
): number | null {
  return readingAt(readings, date, hour)?.value ?? null;
}

export function isDryAt(
  readings: CanonicalReading[],
  date: string,
  hour: number,
): boolean | null {
  const v = valueAt(readings, date, hour);
  return v === null ? null : v === 0;
}

export function offsetAt(
  readings: CanonicalReading[],
  date: string,
  hour: number,
): string | null {
  return readingAt(readings, date, hour)?.localOffset ?? null;
}

/** Sum of hourly values for `date` over the inclusive local-hour range [hourStart, hourEnd]. */
export function sumRange(
  readings: CanonicalReading[],
  date: string,
  hourStart: number,
  hourEnd: number,
): number {
  const sum = readings
    .filter(
      (r) =>
        r.localDate === date &&
        r.localHour >= hourStart &&
        r.localHour <= hourEnd,
    )
    .reduce((acc, r) => acc + r.value, 0);
  return Math.round(sum * 100) / 100;
}

export function dailyTotal(readings: CanonicalReading[], date: string): number {
  return sumRange(readings, date, 0, 23);
}

/** The local hour (and its value) with the most rain on `date`. Ties resolve to the earliest hour. */
export function argmaxHour(
  readings: CanonicalReading[],
  date: string,
): { hour: number; value: number } | null {
  const dayReadings = readings.filter((r) => r.localDate === date);
  if (dayReadings.length === 0) return null;
  const best = dayReadings.reduce((max, r) => (r.value > max.value ? r : max));
  return { hour: best.localHour, value: best.value };
}

/** The local calendar date with the highest total rainfall across all readings. */
export function wettestDate(readings: CanonicalReading[]): string {
  const dates = localDatesInOrder(readings);
  const totals = dates.map((d) => ({
    date: d,
    total: dailyTotal(readings, d),
  }));
  const best = totals.reduce((max, t) => (t.total > max.total ? t : max));
  return best.date;
}

/** The day object (as declared in the JSON, by its own `date` field) matching `date`, if any. */
export function dayObjectFor(
  fixture: LocalForecastResponse,
  date: string,
): LocalForecastResponse["forecast"][number] | undefined {
  return fixture.forecast.find((d) => d.date === date);
}
