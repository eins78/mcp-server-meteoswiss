# meteoswiss-docs-site

Astro + Starlight static site publishing the `meteoswiss-forecast-evals` promptfoo eval runs —
and editorial explaining them — to GitHub Pages. See
[`docs/plans/2026-07-11-pages-starlight-implementation-plan.md`](../../docs/plans/2026-07-11-pages-starlight-implementation-plan.md)
for the original design; the 2026-07-18 sessionlog covers the re-scope to runs-only (this site
does **not** publish plans, sessionlogs, research, or any other internal/process docs — that's
deliberate, not an oversight).

Standalone project (own `pnpm-workspace.yaml`, excluded from the monorepo's root install —
same pattern as `meteoswiss-forecast-evals`, see the root `pnpm-workspace.yaml` comment).

## Content sources

This package's own hand-authored content is the homepage (`src/content/docs/index.mdx`) and a
directory of editorial stubs (`editorial/<run-slug>.md`, one per eval run — a required `teaser`
field plus light "what this tests / how to read it" prose). Everything else is assembled at
build time by `scripts/sync-content.ts`:

- `packages/meteoswiss-forecast-evals/docs/results/*.md` (the run write-ups) →
  `src/content/docs/runs/` (public URL: `/runs/<slug>/` — a deliberate, final choice since this
  site is linked to publicly; do not rename without checking with Max first, it breaks every
  external link already handed out), each with its paired `editorial/<slug>.md` content injected
  right after the frontmatter. **A run without a paired editorial stub is skipped entirely** —
  not published without the explanatory framing.
- `packages/meteoswiss-forecast-evals/docs/results/*.html` (the promptfoo static snapshots) →
  `public/forecast-evals-results/`, served byte-for-byte, outside the content-collection
  pipeline, linked inline from the matching run page.
- `src/data/runs.generated.json` — a `{slug, title, teaser, href}` manifest of every published
  run, imported by the homepage to render its teaser list.

The sync script is idempotent and destructive on its own output — it clears
`src/content/docs/*` (except the hand-authored `index.mdx`) and `public/forecast-evals-results/`
before every run. Never hand-edit synced files; edit the source in
`packages/meteoswiss-forecast-evals/docs/results/` or this package's `editorial/` instead.

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
