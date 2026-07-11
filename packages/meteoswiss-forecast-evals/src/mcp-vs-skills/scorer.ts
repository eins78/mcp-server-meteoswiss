/**
 * promptfoo `javascript` assertion entrypoint for the MCP-vs-skills track — referenced
 * as `file://src/mcp-vs-skills/scorer.ts` from generated/mcp-skills-tests.json. Same
 * native-TS loading story as ../scorer.ts (see that file's header).
 */

import { scoreAnswer, type Expected } from "./scoring-model.js";

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
  let expected: Expected;
  try {
    expected = JSON.parse(expectedJson) as Expected;
  } catch {
    return {
      pass: false,
      score: 0,
      reason: "scorer misconfigured: vars.expectedJson is not valid JSON",
    };
  }
  const rawText = typeof output === "string" ? output : JSON.stringify(output);
  const result = scoreAnswer(rawText, expected);
  return {
    pass: result.pass,
    score: result.score,
    reason: `[${result.outcome}] ${result.detail}`,
  };
}
