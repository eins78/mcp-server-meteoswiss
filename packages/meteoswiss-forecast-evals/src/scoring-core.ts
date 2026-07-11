/**
 * Lenient parsing + comparison, shared by the promptfoo `javascript` assertion (scorer.ts,
 * loaded directly by promptfoo at grading time — see that file's header for how a plain .ts
 * file works there with no build step) and by the offline unit tests (scoring.test.ts).
 *
 * "Lenient" per ../docs/spec.md "Question set": a tiny model that answers correctly but wraps
 * the JSON in prose, or uses a markdown fence, must NOT be scored as wrong for that — that
 * would measure JSON-
 * formatting compliance, not forecast comprehension. We separate three outcomes:
 *   - correct   (parsed and matches ground truth)
 *   - wrong     (parsed but does not match ground truth)
 *   - unparseable (no JSON object could be recovered from the response at all)
 * `summarize.ts` reports these as three distinct buckets.
 */

import type { Expected, LeafExpected } from "./questions.js";

/**
 * Scan a string for every top-level balanced {...} block (brace depth returns to 0). A
 * reasoning-leaking model (see gemini-3.1-pro-preview / gpt-5.2 in
 * ../docs/results/2026-07-09-forecast-json-comprehension.md) can emit braces in
 * its prose ("I'll return {\"mm\": 0.3}.") BEFORE the real trailing answer object — a naive
 * first-`{`-to-last-`}` slice spans both and fails to parse either. Returns blocks in the order
 * found; callers should prefer the LAST one, since the answer trails the reasoning.
 */
function balancedJsonBlocks(raw: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === "}") {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          blocks.push(raw.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  return blocks;
}

/**
 * Try to recover a JSON object from a raw model response: strict parse first, then strip
 * markdown code fences, then fall back to each individually-balanced {...} block (last first —
 * see balancedJsonBlocks). Returns `undefined` if nothing parseable was found.
 */
export function extractJson(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string") return undefined;
  const attempts = [raw.trim()];

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  attempts.push(...balancedJsonBlocks(raw).reverse());

  for (const candidate of attempts) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

function coerceBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["yes", "true", "y"].includes(v)) return true;
    if (["no", "false", "n"].includes(v)) return false;
  }
  return undefined;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return undefined;
}

/**
 * Strict numeric coercion for the fabrication scan: a value counts as a number
 * only if it IS a JSON number or a fully-numeric string. Unlike {@link coerceNumber}
 * this does NOT extract a digit-run from prose, so an annotated decline like
 * `{"note": "no data for 2026-04-06"}` is not misread as a fabricated `2026`
 * (EVAL-1).
 */
function strictNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  return undefined;
}

/**
 * Accepts "09:00", "9:00", 9, "9", "hour 9" -> 9. Prefers a clock ("HH:MM") pattern over a bare
 * digit run — a model that answers with a full ISO timestamp (e.g.
 * "2026-03-28T09:00:00+01:00", instead of the requested "HH:00") would otherwise have its FIRST
 * 1-2 digit run ("20", from the year) grabbed instead of the actual hour ("09"), incorrectly
 * marking a correct answer wrong. The bare-digit fallback below excludes digits that are part of
 * a longer run (e.g. the "20" / "26" in "2026") via lookaround, so it doesn't fall into the same
 * trap when no clock pattern is present.
 */
function coerceHour(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.trunc(value);
  if (typeof value === "string") {
    const clock = value.match(/(\d{1,2}):\d{2}/);
    if (clock?.[1]) return Number(clock[1]);
    const bare = value.match(/(?<!\d)(\d{1,2})(?!\d)/);
    if (bare?.[1]) return Number(bare[1]);
  }
  return undefined;
}

/** Accepts "2026-03-28"; kept strict on purpose (the schema explicitly asks for YYYY-MM-DD);
 * loosely accepts surrounding whitespace/quotes/prose. */
function coerceDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0];
}

/** Accepts "+02:00", "+2:00", "+2", "UTC+2" -> "+02:00". */
function coerceOffset(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/([+-])\s*(\d{1,2})(?::?(\d{2}))?/);
  if (!match?.[1] || !match[2]) return undefined;
  const sign = match[1];
  const hours = match[2].padStart(2, "0");
  const minutes = (match[3] ?? "00").padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

type LeafResult = { pass: boolean; score: 0 | 1; reason: string };

/** Score one leaf expectation against a parsed answer object. */
function scoreLeaf(
  parsed: Record<string, unknown> | undefined,
  leaf: LeafExpected,
): LeafResult {
  const raw = parsed ? parsed[leaf.key] : undefined;

  if (leaf.kind === "unavailable") {
    const bool = coerceBool(raw);
    // Correct iff the model EXPLICITLY declined (key coerces to false) AND did not also
    // fabricate a number under ANY other key in the response (e.g. the schema's "mm" for
    // stationQuestion's {"hourly_available": true, "mm": <number>} / {"hourly_available":
    // false}, or "gust_kmh" for the multiseries gust-unavailable question — checking every
    // other key generically, rather than one hardcoded name, lets this same leaf kind cover
    // any "decline or fabricate" schema without a scorer change per question). Omitting the
    // flag entirely (raw === undefined) is NOT treated as a decline — that previously let
    // `{"mm": 2}` (a bare fabrication with no flag at all) pass, defeating the hallucination
    // check this question exists to enforce.
    const fabricatedEntry = parsed
      ? Object.entries(parsed)
          .filter(([key]) => key !== leaf.key)
          .map(([key, value]) => [key, strictNumericValue(value)] as const)
          .find(([, n]) => n !== undefined)
      : undefined;
    const pass = bool === false && fabricatedEntry === undefined;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? "declined as expected"
        : `fabricated or unclear: ${JSON.stringify(raw)}${fabricatedEntry !== undefined ? ` (also gave ${fabricatedEntry[0]}=${fabricatedEntry[1]})` : ""}`,
    };
  }

  if (raw === undefined) {
    return { pass: false, score: 0, reason: `missing key "${leaf.key}"` };
  }

  switch (leaf.kind) {
    case "bool": {
      const bool = coerceBool(raw);
      const pass = bool === leaf.value;
      return {
        pass,
        score: pass ? 1 : 0,
        reason: `expected ${leaf.value}, got ${JSON.stringify(raw)}`,
      };
    }
    case "number": {
      const num = coerceNumber(raw);
      const pass =
        num !== undefined && Math.abs(num - leaf.value) <= leaf.tolerance;
      return {
        pass,
        score: pass ? 1 : 0,
        reason: `expected ${leaf.value}±${leaf.tolerance}, got ${JSON.stringify(raw)}`,
      };
    }
    case "hour": {
      const hour = coerceHour(raw);
      const pass = hour === leaf.value;
      return {
        pass,
        score: pass ? 1 : 0,
        reason: `expected hour ${leaf.value}, got ${JSON.stringify(raw)}`,
      };
    }
    case "date": {
      const date = coerceDate(raw);
      const pass = date === leaf.value;
      return {
        pass,
        score: pass ? 1 : 0,
        reason: `expected ${leaf.value}, got ${JSON.stringify(raw)}`,
      };
    }
    case "offset": {
      const offset = coerceOffset(raw);
      const pass = offset === leaf.value;
      return {
        pass,
        score: pass ? 1 : 0,
        reason: `expected ${leaf.value}, got ${JSON.stringify(raw)}`,
      };
    }
  }
}

export type ScoreOutcome = "unparseable" | "wrong" | "correct" | "partial";
export type ScoreResult = {
  outcome: ScoreOutcome;
  score: number;
  pass: boolean;
  detail: string;
};

/** Score a raw model response against an `Expected` (leaf or compound). */
export function scoreResponse(
  rawText: unknown,
  expected: Expected,
): ScoreResult {
  const parsed = extractJson(rawText);
  if (parsed === undefined) {
    return {
      outcome: "unparseable",
      score: 0,
      pass: false,
      detail: "no JSON object recovered from response",
    };
  }

  const leaves: LeafExpected[] =
    expected.kind === "compound" ? expected.parts : [expected];
  const results = leaves.map((leaf) => scoreLeaf(parsed, leaf));
  const score = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const pass = score === 1;
  const outcome: ScoreOutcome = pass
    ? "correct"
    : score > 0
      ? "partial"
      : "wrong";
  const detail = results.map((r) => r.reason).join("; ");
  return { outcome, score, pass, detail };
}
