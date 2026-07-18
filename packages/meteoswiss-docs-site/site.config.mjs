// Shared between astro.config.mjs and scripts/sync-content.ts — the sync script injects
// links into markdown *before* Astro's build runs, so it can't rely on Astro's own `base`
// rewriting (which only applies to Astro/Starlight-native asset and route references, not
// literal root-relative URLs already baked into markdown source — verified empirically: an
// unprefixed link survived a full build unchanged). One source of truth avoids the two
// silently drifting apart.
//
// code.178.is is an account-level Pages custom domain shared across repos, not a dedicated
// one — this site is reachable at code.178.is/meteoswiss-llm-tools/ (repo name in the path),
// so BASE is required exactly like a default *.github.io project-page deployment would need.
// See docs/plans/2026-07-11-pages-starlight-implementation-plan.md "GH Pages base path".
export const SITE = 'https://code.178.is';
export const BASE = '/meteoswiss-llm-tools';
