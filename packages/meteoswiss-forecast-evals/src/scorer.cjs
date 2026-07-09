/**
 * promptfoo `javascript` assertion entrypoint (referenced as `file://src/scorer.cjs` from
 * promptfooconfig.yaml). Grades one model response against the `expected` ground truth that
 * generate-tests.ts baked into `vars.expectedJson` for this test case.
 *
 * promptfoo calls the file's `module.exports` as `(output, context) => GradingResult`
 * (may return a Promise — promptfoo awaits it):
 * https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/
 *
 * Deliberately CommonJS (`.cjs`, `module.exports`), not ESM `export default`: that's the
 * pattern promptfoo's own docs show, and this file is loaded by promptfoo's runtime rather
 * than our own build — matching their documented example exactly removes a whole class of
 * "does their loader support ESM default exports" risk for a file we only get to
 * smoke-test once against real spend. scoring-core.mjs itself stays plain ESM (cleanest for
 * our own TS unit tests) and is pulled in here via dynamic `import()`, which works
 * from CommonJS regardless of the target file's module format.
 */

module.exports = async function grade(output, context) {
  const { scoreResponse } = await import("./scoring-core.mjs");

  const expectedJson = context && context.vars && context.vars.expectedJson;
  if (typeof expectedJson !== "string") {
    return {
      pass: false,
      score: 0,
      reason: "scorer misconfigured: vars.expectedJson missing",
    };
  }

  let expected;
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
  const result = scoreResponse(rawText, expected);

  return {
    pass: result.pass,
    score: result.score,
    reason: `[${result.outcome}] ${result.detail}`,
  };
};
