/**
 * Candidate optimization for long series (secondary track, see PLAN.md "Compact long-series
 * representation"): tests whether a SPARSE hourly representation -- listing only hours with
 * measurable precipitation, with a note explaining that omitted hours were 0mm -- rescues
 * tiny-tier comprehension on the 7-day fixture, where the full ~168-entry hourly array (144 of
 * them zero) dragged tiny-tier accuracy to ~50% in the full sweep (see PLAN.md "Full sweep
 * results, complete"). This does NOT reflect anything `meteoswiss-mcp` emits today -- it's a
 * hypothetical alternative representation, evaluated before deciding whether it's worth
 * building into the multi-series expansion.
 *
 * Derived from the SAME sevenDayLocal fixture instants used by the full-representation track
 * (src/questions.ts `sevenDayQuestions`), so ground truth is unchanged -- only the JSON shape
 * shown to the model differs, isolating this one variable the same way fixture.ts isolates the
 * local-vs-UTC one.
 */

import type { LocalForecastResponse } from "./types.js";

const HOURLY_NOTE =
  "Only local hours with measurable precipitation (more than 0mm) are listed here. Any local hour of this day NOT listed had 0mm precipitation.";

export function compactSevenDayFixture(
  fixture: LocalForecastResponse,
): unknown {
  return {
    ...fixture,
    forecast: fixture.forecast.map((day) => {
      if (day.precipitation.hourly === null) return day;
      const nonzero = day.precipitation.hourly.filter((h) => h.value > 0);
      return {
        ...day,
        precipitation: {
          ...day.precipitation,
          hourly: nonzero,
          hourly_note: HOURLY_NOTE,
        },
      };
    }),
  };
}
