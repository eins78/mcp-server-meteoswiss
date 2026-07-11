# GH Pages site generator — stack options

**Superseded.** Max picked Astro Starlight — see
[`2026-07-11-pages-starlight-implementation-plan.md`](2026-07-11-pages-starlight-implementation-plan.md)
for the implemented design. Kept for the record of what was considered.

## Context

GH Pages (legacy branch-deploy, `main`/`docs`) is broken two ways: (1) it only serves
repo-root `docs/`, never `packages/meteoswiss-forecast-evals/docs/results/` — so the committed
eval snapshot 404s regardless of build status; (2) the Jekyll build itself still errors even
with `.nojekyll`. Fix: switch to GitHub Actions-based Pages deploy (`actions/upload-pages-
artifact` + `actions/deploy-pages`), with a build step that assembles **both** source trees —
repo-root `docs/` (34 markdown files: plans, sessionlogs, research, test-reports) and the evals
package's `docs/results/` (markdown writeups **+ pre-rendered, self-contained promptfoo HTML
snapshots**) — into one static site.

**Constraint that applies to every option below:** none of these tools natively read two
separate content roots. All of them need a small prep step (copy or symlink both trees into one
staging dir before the generator runs) — this isn't a differentiator, just a shared cost.

**The promptfoo snapshots are the one delicate part.** They're already complete, self-contained
HTML files (own `<html>`/`<head>`/inline `<script>`, verified no external refs). Any option that
tries to *render* them (markdown pipeline, MDX/component parsing) risks mangling them. All four
options below have a **verbatim static-file passthrough** mechanism — confirmed for each, not
assumed — so the snapshots are always copied byte-for-byte, never reprocessed.

## Options

### A. Plain Node build script (zero framework)

A ~100-150 line script (`docs/site/build.mjs` or similar) using `marked` (or `markdown-it`) to
render `.md` → `.html` with one hand-written template, plus `fs.cpSync` to copy the promptfoo
`.html` snapshots as-is, plus a generated `index.html` with links.

- **Build complexity:** All manual — nav, styling, index generation, base-path link rewriting
  all hand-rolled. Most code to write, least to configure.
- **Deps:** One small markdown lib (or literally zero if you accept raw `<pre>`-wrapped output).
- **Monorepo fit:** Perfect — pure Node, no new toolchain, trivial to `pnpm add -D marked` in a
  small script package.
- **Base-path handling:** Manual — you write the prefix into every generated link yourself. Easy
  to get subtly wrong (relative vs. absolute links), no framework safety net.
- **Promptfoo snapshot handling:** Trivial — just `fs.cpSync`.
- **GH-Actions-Pages fit:** Straightforward — script outputs to a dir, upload that dir.

### B. Eleventy (11ty)

Zero-config-friendly, JS-native static site generator. Markdown-first, built for exactly this
"pile of docs → site" shape.

- **Build complexity:** Low-moderate — `eleventyConfig.addPassthroughCopy()` handles the
  promptfoo HTML verbatim; write a couple of Nunjucks/Liquid layout templates for nav (more setup
  than a starter theme gives you for free, less than hand-rolling from scratch).
- **Deps:** `@11ty/eleventy` only — no framework runtime (no Vue/React), stays in plain-JS land.
- **Monorepo fit:** Good — Node-native, pnpm-friendly, no new language.
- **Base-path handling:** `pathPrefix` config (`/meteoswiss-llm-tools/`), rewrites absolute URLs
  in generated HTML automatically — verified via 11ty's own docs.
- **Promptfoo snapshot handling:** `addPassthroughCopy()` — verified, exactly designed for this.
- **GH-Actions-Pages fit:** Well-trodden path, output dir → upload directly.

### C. VitePress

Vite/Vue-powered docs generator. Zero-config markdown rendering with a polished default theme —
sidebar nav, search, dark mode — out of the box.

- **Build complexity:** Lowest of the "real generator" options for a good-looking result — point
  it at a markdown dir, get nav+search+theme for free. No Vue authoring needed; you only write
  markdown.
- **Deps:** Vite + Vue + VitePress — heaviest dependency tree of the four, though all
  devDependencies, nothing ships to the app.
- **Monorepo fit:** Fine — official pnpm support, purely a docs devDependency, doesn't touch
  `meteoswiss-mcp`/`meteoswiss-forecast-evals` source or their own toolchains.
- **Base-path handling:** `base` config option — verified via VitePress docs, and asset paths in
  markdown auto-adjust when `base` changes.
- **Promptfoo snapshot handling:** `public/` directory — files copied to output root as-is,
  referenced by root-absolute path — verified via VitePress docs. Exactly what's needed: the
  snapshots stay outside VitePress's own markdown/Vue rendering entirely.
- **GH-Actions-Pages fit:** Extremely common pairing; VitePress's own docs include a GH Actions
  Pages deploy recipe.

### D. MkDocs-Material

Python-based, arguably the best out-of-the-box docs UX of any option here (nav, search,
typography, versioning if ever needed).

- **Build complexity:** Lowest for the *nicest* result — near-zero config for a great theme.
- **Deps:** **Python + pip**, not Node — this is the real cost. This repo is 100% TypeScript/pnpm
  today; MkDocs would be the only Python dependency anywhere in the project, needing its own CI
  toolchain step (`actions/setup-python` + `pip install mkdocs-material`) alongside the existing
  Node/pnpm one.
- **Monorepo fit:** Weakest of the four — a second language runtime purely for docs publishing.
- **Base-path handling:** Handled automatically by `mkdocs gh-deploy` conventions / `site_url`
  config — standard, well-documented.
- **Promptfoo snapshot handling:** Confirmed — MkDocs copies any non-`.md` file under `docs_dir`
  to the built site unaltered, verbatim, path preserved.
- **GH-Actions-Pages fit:** Common, but pulls in a Python CI step this repo doesn't otherwise
  need.

*(Astro considered and set aside: it's built for interactive/component-driven sites — islands
architecture, MDX, content collections — none of which this use case needs. It would work, but
every one of its differentiators over Eleventy/VitePress goes unused here.)*

> **Superseded by outcome:** Max ultimately picked Astro's Starlight preset, not vanilla Astro —
> see the implementation plan. Starlight ships the doc-site scaffolding (content collections,
> sidebar, search) out of the box, which changes the calculus above; the original reasoning is
> kept here for the record, not as live guidance.

## Recommendation

**VitePress.** The actual deliverable — a public, permanent showcase of engineering reports and
eval snapshots — benefits far more from batteries-included nav/search/theme than from avoiding a
Vite/Vue devDependency (which never touches app code). Confirmed it cleanly separates "render my
markdown" from "serve this file verbatim" via `public/`, so the promptfoo snapshots are never at
risk of being mangled. `base` config is a one-liner for the `/meteoswiss-llm-tools/` subpath.

**If Max wants to stay closer to zero-framework:** Eleventy is the fallback — same passthrough
safety for the snapshots, pure Node, but plan on writing your own nav/theme (no free lunch there).

**Not recommended:** the plain Node script (more to build and maintain than Eleventy for no real
gain) and MkDocs-Material (best output, but the only Python dependency in an all-TS/pnpm repo).
