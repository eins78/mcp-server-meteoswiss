/**
 * Lenient parsing + comparison, shared by the promptfoo `javascript` assertion (scorer.ts,
 * loaded directly by promptfoo at grading time — see that file's header for how a plain .ts
 * file works there with no build step) and by the offline unit tests (scoring.test.ts).
 *
 * "Lenient" per PLAN.md: a tiny model that answers correctly but wraps the JSON in prose, or
 * uses a markdown fence, must NOT be scored as wrong for that — that would measure JSON-
 * formatting compliance, not forecast comprehension. We separate three outcomes:
 *   - correct   (parsed and matches ground truth)
 *   - wrong     (parsed but does not match ground truth)
 *   - unparseable (no JSON object could be recovered from the response at all)
 * `summarize.ts` reports these as three distinct buckets.
 */

import type { Expected, LeafExpected } from "./questions.js";

/**
 * Try to recover a JSON object from a raw model response: strict parse first, then strip
 * markdown code fences, then fall back to extracting the first balanced-looking {...} block.
 * Returns `undefined` if nothing parseable was found.
 */
export function extractJson(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string") return undefined;
  const attempts = [raw.trim()];

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(raw.slice(firstBrace, lastBrace + 1).trim());
  }

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

/** Accepts "09:00", "9:00", 9, "9", "hour 9" -> 9. */
function coerceHour(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.trunc(value);
  if (typeof value === "string") {
    const match = value.match(/(\d{1,2})(?::\d{2})?/);
    if (match?.[1]) return Number(match[1]);
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
    // Correct iff the model explicitly declined (key coerces to false). Missing key
    // (model didn't even attempt the key) is also treated as "did not fabricate a number"
    // and counts as correct, since the schema allows omitting `mm` entirely when declining.
    const pass = bool === false || (raw === undefined && parsed !== undefined);
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? "declined as expected"
        : `fabricated value: ${JSON.stringify(raw)}`,
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
