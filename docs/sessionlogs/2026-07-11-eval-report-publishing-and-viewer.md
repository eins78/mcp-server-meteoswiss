# Publishing eval reports + a persistent Tailscale viewer

**Date:** 2026-07-11
**Model:** Opus 4.8, worktree `eval-report-publishing`, branch `infra/eval-report-publishing`
**Related:** [PR #100](https://github.com/eins78/meteoswiss-llm-tools/pull/100) (evals package),
`packages/meteoswiss-forecast-evals/docs/results/2026-07-09-forecast-json-comprehension.md`

## Motivation

The 2026-07-09 full 13-provider eval sweep only lived in two places: the local promptfoo SQLite
DB (`~/.promptfoo/promptfoo.db`, never committed) and a live viewer process started ad hoc in a
prior session. Neither survives a reboot or is reachable without the local machine + an active
terminal session. Max wanted the results durable and browsable in more than one way: a committed
static snapshot, a public GitHub Pages copy (this is a demo/showcase repo — public exposure is
intentional), and a persistent live viewer over Tailscale that survives reboots.

## What shipped

- **`docs/results/2026-07-09-forecast-json-comprehension.html`** — a self-contained static
  export (`promptfoo export eval <id> -o ...html`) of the real full sweep, committed next to its
  existing markdown writeup. Verified no external asset/API references (opens offline) and no
  secrets embedded (provider config only carries model IDs/labels/generation params).
- **`.gitignore`**: `generated/*.html` — ad-hoc `promptfoo export` scratch output stays
  gitignored; publishing is now a deliberate `cp` into `docs/results/` + commit, documented in
  the package README ("Publishing a results snapshot").
- **`docs/test-reports/2026-04-03-mcp-tool-test-report.md`** — a previously-untracked live MCP
  tool test report (23 cases, 6 tools), moved into a discoverable, dated location.
- **GitHub Pages enabled** (deploy from `main`, `/docs`) — this repo is already public, so this
  doesn't newly expose anything; it just renders `docs/` as a browsable site at
  `https://code.178.is/meteoswiss-llm-tools/` (this account's Pages custom domain, CNAME'd to
  `eins78.github.io`). First build errored generically ("Page build failed") — root cause: the
  default *legacy* build type runs the whole `/docs` folder through Jekyll, and with dozens of
  markdown files (plans, sessionlogs, research, results) there's ample opportunity for
  mustache-looking text inside a code block to break Jekyll's Liquid parser. Fixed with an empty
  `docs/.nojekyll` (skips the Jekyll step entirely, serves files as-is) — the standard fix for
  this failure mode. Site should build clean once this merges to `main`; re-verify after merge.
- **Persistent viewer**: `scripts/start-viewer.sh` + `scripts/li.kiste.meteoswiss-evals-viewer.plist`
  in the evals package, run as a launchd LaunchAgent so `promptfoo view` survives reboots/sleep
  and restarts on crash, exposed only on the tailnet via `tailscale serve` (never public).

## The launchd/Tailscale ordering bug (the actual hard part)

First script draft ran `tailscale serve --bg --https=15500 ...` *before* starting the viewer.
Testing surfaced a real `EADDRINUSE` failure that isn't obvious from either tool's docs:
`tailscale serve` makes tailscaled itself hold a **specific-address** bind on the tailnet
interface's port 15500, and `promptfoo view` binds the **wildcard** address (`0.0.0.0:15500`, no
`--host` flag to restrict it). A wildcard bind fails if a specific-address bind on that port
already exists. Confirmed by removing the mapping and watching `netstat` clear.

This isn't just a script-ordering issue — it's a real reboot hazard. `tailscaled` is a system
daemon that restores its persisted `serve` config independently of (and earlier than) a user
LaunchAgent. After every reboot, tailscaled would already hold port 15500 by the time the viewer
LaunchAgent starts, and the viewer would fail to bind, permanently (RunAtLoad only fires once;
KeepAlive would crash-loop against the same conflict indefinitely).

Fix: `start-viewer.sh` now defensively clears the mapping (`tailscale serve --https=15500 off`,
safe no-op if nothing's mapped) *before* starting the viewer, waits for the viewer to actually
bind (polling `curl 127.0.0.1:15500`), then reasserts the mapping. Since the script no longer
`exec`s into promptfoo (needs to run code after it starts), it backgrounds the viewer and `wait`s
on it instead — launchd supervises the wrapper script's lifetime, which now matches the viewer's.

## Verification

- Local + tailnet reachability confirmed via `curl` (grepping for a UI marker, not just HTTP 200)
  after a clean start.
- **Crash-restart tested for real**: bootstrapped a throwaway test LaunchAgent (same script,
  disposable Label, cleaned up afterward), `kill -9`'d the running viewer PID, confirmed launchd's
  `KeepAlive` restarted it (`runs` incremented, new PID, `last exit code` clean) *and* that the
  clear/start/reassert sequence correctly re-established both local and tailnet reachability
  post-restart.
- `plutil -lint` on the plist, `bash -n` on the script — both clean.
- The final, permanent LaunchAgent (pointing at the merged `main` checkout, not the worktree)
  is installed and verified as a separate step after this PR merges — see the follow-ups below.

## /simplify pass (4 parallel review agents: reuse, simplification, efficiency, altitude)

Applied:
- **Reuse**: `WorkingDirectory` plist key, matching the sibling `li.kiste.hermes-kokoro-bridge`
  agent's pattern, instead of the script computing its own dir and `cd`-ing.
- **Reuse + simplification (same finding, independently)**: dropped the script's own
  `export PATH=...` — the plist's `EnvironmentVariables.PATH` was already the same fact stated
  twice; one source of truth now.
- **Efficiency**: added an explicit `ThrottleInterval` (30s) rather than relying on launchd's
  implicit default — if the viewer can't bind at all, each retry re-runs the full
  clear/spawn/30s-poll/reassert sequence, which is expensive enough per-iteration to want an
  explicit, considered value rather than whatever the default happens to be.

Tried and reverted after empirical testing disproved it:
- **Efficiency** also suggested skipping the `tailscale serve ... off` step when the existing
  mapping already pointed at the right target, to avoid a brief reachability gap on an ordinary
  crash-restart. Implemented it, re-ran the bootstrap → kill -9 → restart test — and it broke:
  `EADDRINUSE` again. Root cause the suggestion missed: `tailscale serve --bg` mappings are held
  by tailscaled independent of backend liveness — killing/restarting the viewer does *not*
  release tailscaled's specific-address bind, so "does the existing mapping already point at the
  right target" is not a valid signal for "safe to skip clearing." The bind must always be
  cleared before every fresh promptfoo start, full stop. Reverted to the unconditional `off`,
  with a comment recording why the seemingly-obvious optimization doesn't hold.

Not applied (out of scope for this PR, noted as follow-ups): the altitude review correctly
pointed out this Tailscale-wildcard-bind conflict class isn't documented anywhere at the
workspace level (`~/OPS/home-workspace/docs/launchd-agents.md`), so any *future* `li.kiste.*`
service with the same shape (wildcard bind + fronted by `tailscale serve`) will rediscover this
the same way this session did. That doc lives in a different repo — flagged for Max rather than
edited here.

## Pending / follow-ups

- [ ] Confirm GitHub Pages builds green after merge (added `.nojekyll` to fix the pre-merge
      error; the fix targets `main`, which is what Pages actually builds from).
- [ ] Install the permanent LaunchAgent from the merged `main` checkout (symlink into
      `~/Library/LaunchAgents/`, `launchctl bootstrap`), verify reachable, report the confirmed
      Tailscale URL.
