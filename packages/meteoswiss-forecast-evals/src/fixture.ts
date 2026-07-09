/**
 * Load committed fixtures and derive the UTC-vs-local format variants that are the
 * headline A/B ablation of this eval suite (see ../docs/spec.md).
 *
 * Both variants encode the exact same instants — only the `hourly[].time` string
 * representation differs:
 *   - LOCAL variant (fixtures/*-local.json, committed as-is): what PR #99 actually emits,
 *     e.g. "2026-03-28T09:00:00+01:00" (Europe/Zurich wall time + UTC offset).
 *   - UTC variant (derived here): the same instant re-rendered with a "Z" suffix,
 *     e.g. "2026-03-28T08:00:00Z".
 *
 * Ground truth (src/ground-truth.ts) is computed once from the LOCAL variant's instants,
 * so a question's correct answer is identical regardless of which variant a model sees —
 * only the model's ability to read it correctly should vary.
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isLocalForecastResponse,
  type LocalForecastResponse,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

export function loadFixture(fileName: string): LocalForecastResponse {
  const filePath = path.join(FIXTURES_DIR, fileName);
  const raw: unknown = JSON.parse(readFileSync(filePath, "utf-8"));
  if (!isLocalForecastResponse(raw)) {
    throw new Error(`${filePath} does not look like a LocalForecastResponse`);
  }
  return raw;
}

/**
 * Re-render an ISO-8601 instant (any offset, including "Z") as UTC with a "Z" suffix,
 * e.g. "2026-03-28T09:00:00+01:00" -> "2026-03-28T08:00:00Z". Preserves the true instant
 * (unlike a naive string swap, which would silently produce the wrong time).
 */
export function toUtcIso(localIso: string): string {
  const d = new Date(localIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Not a valid ISO instant: ${localIso}`);
  }
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Deep-clone a LocalForecastResponse with every `precipitation.hourly[].time` rewritten
 * from local-offset to UTC ("Z"). Everything else (values, totals, weather, dates) is
 * untouched — this isolates the ablation to exactly the one format choice under test.
 */
export function toUtcVariant(
  fixture: LocalForecastResponse,
): LocalForecastResponse {
  const clone: LocalForecastResponse = JSON.parse(JSON.stringify(fixture));
  for (const day of clone.forecast) {
    if (day.precipitation.hourly === null) continue;
    day.precipitation.hourly = day.precipitation.hourly.map((h) => ({
      ...h,
      time: toUtcIso(h.time),
    }));
  }
  return clone;
}

export type Variant = "local" | "utc";

export function variantOf(
  fixture: LocalForecastResponse,
  variant: Variant,
): LocalForecastResponse {
  return variant === "local" ? fixture : toUtcVariant(fixture);
}
