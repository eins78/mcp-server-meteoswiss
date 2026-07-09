/**
 * promptfoo `javascript` assertion entrypoint (referenced as `file://src/scorer.ts` from
 * promptfooconfig*.yaml). Grades one model response against the `expected` ground truth that
 * generate-tests.ts baked into `vars.expectedJson` for this test case.
 *
 * WHY PLAIN .ts, NO BUILD STEP: promptfoo's own docs say external assertion files must be
 * pre-transpiled JS ("if transpiling TypeScript, point promptfoo to the transpiled output") —
 * so this originally shipped as hand-written scorer.cjs/scoring-core.mjs. Verified empirically
 * instead of trusting the docs: promptfoo just does a plain dynamic `import()`/`require()` on
 * the `file://` path, and on this repo's pinned Node version (24.18, see .nvmrc; CI pins
 * node-version: 24 everywhere) that resolves through Node's OWN native TypeScript support
 * (type-stripping, on by default since Node 23.6 for "erasable" syntax — interfaces, type
 * annotations, `satisfies`; no enums/namespaces/parameter-properties, which this repo's
 * TypeScript standards already forbid anyway, e.g. "Never use TypeScript enums"). So promptfoo
 * loading a `.ts` file directly isn't promptfoo transpiling anything — it's Node doing what it
 * already does for every other file in this monorepo. This matches the workspace default (full
 * TypeScript via tsx / native execution, no build step) instead of the previous CJS/ESM plain-
 * JS workaround. See ../docs/spec.md "Q-A" for the full writeup.
 *
 * promptfoo calls this file's default export as `(output, context) => GradingResult`
 * (may return a Promise — promptfoo awaits it):
 * https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/
 */

import { scoreResponse } from "./scoring-core.js";

type GradingResult = { pass: boolean; score: number; reason: string };
type AssertionContext = { vars?: Record<string, unknown> };

export default async function grade(
  output: unknown,
  context: AssertionContext,
): Promise<GradingResult> {
  const expectedJson = context.vars?.expectedJson;
  if (typeof expectedJson !== "string") {
    return {
      pass: false,
      score: 0,
      reason: "scorer misconfigured: vars.expectedJson missing",
    };
  }

  let expected: unknown;
  try {
    expected = JSON.parse(expectedJson);
  } catch {
    return {
      pass: false,
      score: 0,
      reason: "scorer misconfigured: vars.expectedJson is not valid JSON",
    };
  }

  const rawText = typeof output === "string" ? output : JSON.stringify(output);
  // `expected` came from our own generate-tests.ts output (generated/tests.json), not from
  // model or user input, so trusting its shape here is safe — see questions.ts for the type.
  const result = scoreResponse(
    rawText,
    expected as Parameters<typeof scoreResponse>[1],
  );

  return {
    pass: result.pass,
    score: result.score,
    reason: `[${result.outcome}] ${result.detail}`,
  };
}
