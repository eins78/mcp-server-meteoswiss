/**
 * Scoring model for the MCP-vs-skills track: the expected-answer data model and the
 * tolerance-based scorer that grades a model's `FINAL_JSON:` line against it.
 *
 * Ground truth is always computed from live OGD data by capture-ground-truth.ts — never
 * hand-typed (suite rule, see ../questions.ts for the original track's version). Tolerances
 * exist because (a) live measurements refresh every 10 minutes between capture and eval,
 * and (b) the two access methods may round differently. Both methods read the same OGD
 * dataset, so agreement within tolerance is the correctness signal.
 */

/** One expected answer field with its comparison rule. */
export type ExpectedField =
  | { kind: "number"; value: number; tolerance: number }
  | { kind: "boolean"; value: boolean }
  /** Answer string must match one of the accepted strings (normalized, substring either way). */
  | { kind: "oneof"; accepted: string[] }
  /** Answer must be an array; each item must match the universe; at least minCount items. */
  | { kind: "subset-of"; universe: string[]; minCount: number }
  /** Answer must be an array matching the expected set (Jaccard similarity). */
  | { kind: "set-match"; expected: string[] }
  /** Field must be present but any value is accepted (e.g. judgment calls in a gray zone). */
  | { kind: "any" };

export type Expected = { fields: Record<string, ExpectedField> };

export type ScoreResult = {
  pass: boolean;
  /** Fraction of fields correct (set fields contribute their partial score). */
  score: number;
  outcome: "ok" | "partial" | "wrong" | "format";
  detail: string;
};

/** Lowercase, strip diacritics, collapse non-alphanumerics — for name comparisons. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Canonicalize a pollen species mention (English/Latin/German synonyms) to one of the
 * 7 measured species tokens, or null if unrecognized.
 */
export function canonicalPollenSpecies(value: string): string | null {
  const n = normalizeName(value);
  const table: Record<string, string[]> = {
    alder: ["alder", "alnus", "erle"],
    birch: ["birch", "betula", "birke"],
    hazel: ["hazel", "corylus", "hasel"],
    beech: ["beech", "fagus", "buche"],
    ash: ["ash", "fraxinus", "esche"],
    oak: ["oak", "quercus", "eiche"],
    grasses: ["grass", "grasses", "poaceae", "graser", "gramineae"],
  };
  for (const [canonical, synonyms] of Object.entries(table)) {
    if (synonyms.some((s) => n === s || n.includes(s))) {
      return canonical;
    }
  }
  return null;
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na.length === 0 || nb.length === 0) {
    return false;
  }
  return na === nb || na.includes(nb) || nb.includes(na);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const n = value.trim().toLowerCase();
    if (["true", "yes", "ja"].includes(n)) return true;
    if (["false", "no", "nein"].includes(n)) return false;
  }
  return null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items = value.filter((v): v is string => typeof v === "string");
  return items.length === value.length ? items : null;
}

/** Score one answer field against its expectation; returns [0..1]. */
function scoreField(field: ExpectedField, answer: unknown): number {
  switch (field.kind) {
    case "number": {
      const n = asNumber(answer);
      if (n === null) return 0;
      return Math.abs(n - field.value) <= field.tolerance ? 1 : 0;
    }
    case "boolean": {
      const b = asBoolean(answer);
      return b !== null && b === field.value ? 1 : 0;
    }
    case "oneof": {
      if (typeof answer !== "string") return 0;
      return field.accepted.some((a) => namesMatch(a, answer)) ? 1 : 0;
    }
    case "subset-of": {
      const items = asStringArray(answer);
      if (items === null) return 0;
      const valid = items.filter((item) =>
        field.universe.some((u) => namesMatch(u, item)),
      ).length;
      // Wrong (non-universe) items don't earn credit; score is valid items vs required.
      return Math.min(1, valid / field.minCount);
    }
    case "set-match": {
      const items = asStringArray(answer);
      if (items === null) return 0;
      const answerSet = new Set(
        items
          .map((item) => canonicalPollenSpecies(item))
          .filter((c): c is string => c !== null),
      );
      const expectedSet = new Set(field.expected);
      if (expectedSet.size === 0 && answerSet.size === 0) return 1;
      const intersection = [...answerSet].filter((a) =>
        expectedSet.has(a),
      ).length;
      const union = new Set([...answerSet, ...expectedSet]).size;
      return union === 0 ? 1 : intersection / union;
    }
    case "any":
      return answer !== undefined ? 1 : 0;
  }
}

/** Extract the JSON payload of the last `FINAL_JSON:` line in the response. */
export function extractFinalJson(rawText: string): unknown | null {
  const matches = [...rawText.matchAll(/FINAL_JSON:\s*(\{.*\})\s*$/gim)];
  const last = matches.at(-1);
  if (last === undefined) {
    return null;
  }
  try {
    return JSON.parse(last[1] ?? "");
  } catch {
    return null;
  }
}

/** Grade a raw model response against the expected answer. */
export function scoreAnswer(rawText: string, expected: Expected): ScoreResult {
  const parsed = extractFinalJson(rawText);
  if (parsed === null || typeof parsed !== "object") {
    return {
      pass: false,
      score: 0,
      outcome: "format",
      detail: "no parseable FINAL_JSON line found",
    };
  }
  const answers = parsed as Record<string, unknown>;
  const fieldNames = Object.keys(expected.fields);
  if (fieldNames.length === 0) {
    return {
      pass: false,
      score: 0,
      outcome: "format",
      detail: "expected has no fields (misconfigured test)",
    };
  }

  const perField = fieldNames.map((name) => {
    const field = expected.fields[name];
    if (field === undefined) {
      return { name, score: 0 };
    }
    return { name, score: scoreField(field, answers[name]) };
  });
  const total = perField.reduce((sum, f) => sum + f.score, 0) / perField.length;
  const wrongFields = perField.filter((f) => f.score < 1).map((f) => f.name);
  const pass = total >= 0.999;

  return {
    pass,
    score: total,
    outcome: pass ? "ok" : total > 0 ? "partial" : "wrong",
    detail: pass
      ? "all fields within tolerance"
      : `fields off: ${wrongFields.join(", ")}`,
  };
}
