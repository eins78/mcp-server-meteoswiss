// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { SITE, BASE } from './site.config.mjs';

// https://astro.build/config
export default defineConfig({
	site: SITE,
	base: BASE,
	integrations: [
		starlight({
			title: 'MeteoSwiss LLM Tools',
			// Matches the default Starlight resolves anyway (public/favicon.svg) — set explicitly
			// so the weather-emoji favicon is documented, not just an accident of file placement.
			favicon: '/favicon.svg',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/eins78/meteoswiss-llm-tools' },
			],
			// This site publishes only the promptfoo eval runs + editorial about them (2026-07-18
			// re-scope) — no plans/sessionlogs/research/internal docs. See the implementation plan for
			// why `forecast-evals-results` (the raw promptfoo HTML snapshots in public/) isn't listed
			// here — autogenerate only scans src/content/docs/, and those files are deliberately
			// outside that pipeline.
			sidebar: [{ label: 'Eval Runs', items: [{ autogenerate: { directory: 'runs' } }] }],
		}),
	],
});
