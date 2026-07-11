# meteoswiss-docs-site

Astro + Starlight static site publishing `meteoswiss-llm-tools` engineering docs and
forecast-evals results to GitHub Pages. See
[`docs/plans/2026-07-11-pages-starlight-implementation-plan.md`](../../docs/plans/2026-07-11-pages-starlight-implementation-plan.md)
for the design.

Standalone project (own `pnpm-workspace.yaml`, excluded from the monorepo's root install —
same pattern as `meteoswiss-forecast-evals`, see the root `pnpm-workspace.yaml` comment).

## Content sources

This package's own hand-authored docs are the homepage (`src/content/docs/index.mdx`) plus a
landing page per sidebar section that has no natural overview source file
(`src/content/docs/plans/index.mdx`, `src/content/docs/forecast-evals/results/index.mdx`).
Everything else is assembled at build time by `scripts/sync-content.ts` from two source trees
elsewhere in the monorepo:

- repo-root `docs/` → `src/content/docs/`
- `packages/meteoswiss-forecast-evals/docs/results/` → `src/content/docs/forecast-evals/results/`
  (markdown writeups) and `public/forecast-evals-results/` (the paired promptfoo static HTML
  snapshots, served byte-for-byte, outside the content-collection pipeline)

The sync script is idempotent and destructive on its own output — it clears
`src/content/docs/*` (except the hand-authored pages listed above) and
`public/forecast-evals-results/` before every run. Never hand-edit synced files; edit the
source in `docs/` or `packages/meteoswiss-forecast-evals/docs/results/` instead.

## Commands

Run from this directory:

```bash
pnpm install
pnpm run dev       # sync content + start dev server at localhost:4321
pnpm run build     # sync content + build production site to ./dist/
pnpm run preview   # preview a production build locally
```

## Deploy

Published via GitHub Actions to GitHub Pages on push to `main` — see
[`../../.github/workflows/pages.yml`](../../.github/workflows/pages.yml) (repo root, not this
package).
