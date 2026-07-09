# Handoff

Status as of 2026-07-09: **suite built and validated, full paid run NOT yet executed.**

## What's done

- Full package built: fixtures, ground truth, 33 programmatic test cases + 4 judge test cases
  (see `generated/` — committed, reviewable), lenient scorer, promptfoo configs, gate-table
  summarizer, run scripts. See `PLAN.md` for the complete design and `README.md` for usage.
- Validated with:
  - 29 offline unit tests (`pnpm test`) — all passing, no network.
  - A $0 `echo`-provider dry run (`pnpm run dryrun`) — confirmed the full pipeline wiring,
    including that `src/scorer.cjs`'s dynamic `import()` of the ESM `scoring-core.mjs` actually
    works under promptfoo's runtime (the biggest unverified-until-tested design risk).
  - A real ~$0.01 smoke test (`pnpm run smoke`, gemini-2.5-flash-lite only) — confirmed the
    OpenRouter path, cost-control (`passthrough.reasoning.enabled: false` — verified 0 reasoning
    tokens leaked), and produced a real (if tiny-sample) finding: 100% local-variant accuracy vs
    44% UTC-variant accuracy on that one model, concentrated in hour-level questions. See
    `PLAN.md` "What the build-time smoke test found".
- `pnpm -r lint` / `build` / `test` green across the whole monorepo.

## What's NOT done (by design — see PLAN.md's build-vs-run guardrail)

- **The full paid sweep has not been run.** `pnpm run eval` (13 models x 33 questions, est.
  $2-3) and `pnpm run eval:judge` (3 models x 4 prompts, est. $1-2) are ready to run but were
  deliberately held back — that's a separate, explicit step requiring sign-off on spending the
  budget, per the task's own guardrail.
- No gate decision has been made yet (merge #99 as-is / tweak the format / hold release) —
  that depends on the full run's result, specifically the tiny-tier x `{local, utc}` block.

## To resume

```bash
cd packages/meteoswiss-forecast-evals
pnpm run eval          # full programmatic sweep
pnpm run eval:judge    # judge slice
pnpm run summarize     # prints the gate table from generated/results.json
```

Then read the gate table (`tiny tier x {local, utc}`, primary fixture) and the question-family
breakdown to decide: format is fine as shipped in #99, or a specific family of questions is
failing uniformly across tiers (format defect, fix on #99 or a stacked follow-up) vs. only
failing for the weakest models (capability, not a format problem — no action needed).

Cross-check the estimated cost total against https://openrouter.ai/activity before/after the
run — promptfoo's own cost field is confirmed non-functional for OpenRouter (see PLAN.md).
