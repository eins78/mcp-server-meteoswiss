/**
 * Live ground-truth acquisition for the MCP-vs-skills track.
 *
 * Parsers are pure functions (unit-tested offline against inline fixture strings);
 * the fetch layer runs only inside capture-ground-truth.ts, immediately before an eval
 * run, so ground truth and the models' answers read the same 10-minute measurement
 * window. Sources:
 *
 *   - current weather + pollen + climate + station metadata: parsed directly from the
 *     OGD CSVs by this file (independent of the MCP server's parsing),
 *   - local forecasts: captured via the running MCP server (reimplementing its DST-aware
 *     hourly bucketing here would duplicate the data layer under test — tolerances and
 *     the shared upstream dataset make this acceptable; see the results doc).
 */

/** One row of a semicolon-delimited CSV, keyed by header column name. */
export type CsvRow = Record<string, string>;

/** Parse a semicolon-delimited CSV into header-keyed rows. */
export function parseSemicolonCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const headerLine = lines[0];
  if (headerLine === undefined) {
    return [];
  }
  const headers = headerLine.split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(";");
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });
}

function numericOrNull(value: string | undefined): number | null {
  if (value === undefined || value === "" || value === "-") {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** station_abbr -> parameter -> numeric value, from the VQHA80 current-weather CSV. */
export function currentFromCsv(
  text: string,
): Map<string, Record<string, number | null>> {
  const result = new Map<string, Record<string, number | null>>();
  for (const row of parseSemicolonCsv(text)) {
    const abbr = row["Station/Location"] ?? row["station_abbr"] ?? "";
    if (abbr === "") continue;
    const values: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(row)) {
      if (
        key === "Station/Location" ||
        key === "station_abbr" ||
        key === "Date"
      )
        continue;
      values[key] = numericOrNull(value);
    }
    result.set(abbr, values);
  }
  return result;
}

/** abbr -> station name, from the (Latin1-decoded) SMN station metadata CSV. */
export function stationNamesFromCsv(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const row of parseSemicolonCsv(text)) {
    const abbr = row["station_abbr"] ?? "";
    const name = row["station_name"] ?? "";
    if (abbr !== "" && name !== "") {
      result.set(abbr, name);
    }
  }
  return result;
}

const POLLEN_PARAM_TO_SPECIES: Record<string, string> = {
  kaalnud1: "alder",
  kabetud1: "birch",
  kacoryd1: "hazel",
  kafagud1: "beech",
  kafraxd1: "ash",
  kaquerd1: "oak",
  khpoacd1: "grasses",
};

/**
 * Most recent daily (d1) pollen readings: canonical species -> particles/m³.
 * Uses the last CSV row (files are chronological, one row per day).
 */
export function pollenFromCsv(text: string): Record<string, number | null> {
  const rows = parseSemicolonCsv(text);
  const last = rows.at(-1);
  const result: Record<string, number | null> = {};
  for (const [param, species] of Object.entries(POLLEN_PARAM_TO_SPECIES)) {
    result[species] = last === undefined ? null : numericOrNull(last[param]);
  }
  return result;
}

/** 'YYYY-MM' -> monthly mean temperature (ths200m0) from an NBCN monthly CSV. */
export function climateMonthlyFromCsv(text: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of parseSemicolonCsv(text)) {
    const ts = row["reference_timestamp"] ?? "";
    const match = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(ts);
    const value = numericOrNull(row["ths200m0"]);
    if (match !== null && value !== null) {
      result.set(`${match[3]}-${match[2]}`, value);
    }
  }
  return result;
}

/** Local (Europe/Zurich) calendar date of a Date, as 'YYYY-MM-DD'. */
export function localDate(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });
}

/** One future local calendar day, with the weekday name questions embed. */
export type UpcomingDay = { date: string; weekday: string };

/**
 * The next two local calendar days after `now` — always inside the 4-day forecast
 * horizon captured for ground truth, on ANY weekday and on either side of midnight
 * (unlike weekend-anchored dates, which sail past the horizon on a Sunday capture).
 * Questions embed the absolute date + weekday name; nothing relative like "tomorrow".
 */
export function upcomingDays(now: Date): { d1: UpcomingDay; d2: UpcomingDay } {
  const day = (offsetDays: number): UpcomingDay => {
    const date = new Date(now.getTime() + offsetDays * 86_400_000);
    return {
      date: localDate(date),
      weekday: date.toLocaleDateString("en-US", {
        timeZone: "Europe/Zurich",
        weekday: "long",
      }),
    };
  };
  return { d1: day(1), d2: day(2) };
}

/** Minimal forecast shape extracted from meteoswissLocalForecast JSON. */
export type ForecastDay = {
  date: string;
  tMax: number | null;
  tMin: number | null;
  precipTotal: number | null;
  sunshineTotalMin: number | null;
  hourly: Array<{
    time: string;
    temp: number | null;
    precip: number | null;
  }>;
};

export function parseForecastJson(jsonText: string): ForecastDay[] {
  const parsed: unknown = JSON.parse(jsonText);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("forecast" in parsed) ||
    !Array.isArray((parsed as { forecast: unknown }).forecast)
  ) {
    throw new Error("unexpected meteoswissLocalForecast shape: no forecast[]");
  }
  const days = (parsed as { forecast: unknown[] }).forecast;
  return days.map((day) => {
    const d = day as Record<string, unknown>;
    const hourlyRaw = Array.isArray(d.hourly) ? d.hourly : [];
    return {
      date: typeof d.date === "string" ? d.date : "",
      tMax:
        typeof d.temperature_max_c === "number" ? d.temperature_max_c : null,
      tMin:
        typeof d.temperature_min_c === "number" ? d.temperature_min_c : null,
      precipTotal:
        typeof d.precipitation_total_mm === "number"
          ? d.precipitation_total_mm
          : null,
      sunshineTotalMin:
        typeof d.sunshine_total_minutes === "number"
          ? d.sunshine_total_minutes
          : null,
      hourly: hourlyRaw.map((hour) => {
        const h = hour as Record<string, unknown>;
        return {
          time: typeof h.time === "string" ? h.time : "",
          temp: typeof h.temperature_c === "number" ? h.temperature_c : null,
          precip: typeof h.precip_mm === "number" ? h.precip_mm : null,
        };
      }),
    };
  });
}

/** Sum hourly precipitation on a local date within [startHour, endHour). */
export function precipInWindow(
  days: ForecastDay[],
  date: string,
  startHour: number,
  endHour: number,
): number {
  const day = days.find((d) => d.date === date);
  if (day === undefined) {
    throw new Error(`no forecast day for ${date}`);
  }
  let total = 0;
  for (const hour of day.hourly) {
    const hh = Number.parseInt(hour.time.slice(11, 13), 10);
    if (hh >= startHour && hh < endHour && hour.precip !== null) {
      total += hour.precip;
    }
  }
  return total;
}

/** Minimum hourly temperature on a local date within [startHour, endHour). */
export function minTempInWindow(
  days: ForecastDay[],
  date: string,
  startHour: number,
  endHour: number,
): number {
  const day = days.find((d) => d.date === date);
  if (day === undefined) {
    throw new Error(`no forecast day for ${date}`);
  }
  const temps = day.hourly
    .filter((hour) => {
      const hh = Number.parseInt(hour.time.slice(11, 13), 10);
      return hh >= startHour && hh < endHour && hour.temp !== null;
    })
    .map((hour) => hour.temp as number);
  if (temps.length === 0) {
    throw new Error(
      `no hourly temperatures for ${date} ${startHour}-${endHour}`,
    );
  }
  return Math.min(...temps);
}

/** Daily value lookup with a clear error when the date is out of range. */
export function dayField(
  days: ForecastDay[],
  date: string,
  field: "tMax" | "tMin" | "precipTotal" | "sunshineTotalMin",
): number {
  const day = days.find((d) => d.date === date);
  const value = day?.[field];
  if (value === undefined || value === null) {
    throw new Error(`forecast ${field} missing for ${date}`);
  }
  return value;
}

const LATIN1_DECODER = new TextDecoder("latin1");

/** Fetch a URL as text; `latin1: true` for the metadata CSVs. */
export async function fetchText(
  url: string,
  options: { latin1?: boolean } = {},
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  const buffer = await response.arrayBuffer();
  return options.latin1 === true
    ? LATIN1_DECODER.decode(buffer)
    : new TextDecoder().decode(buffer);
}
