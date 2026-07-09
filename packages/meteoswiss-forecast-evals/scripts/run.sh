#!/usr/bin/env bash
# Run a promptfoo eval config. Reads OPENROUTER_API_KEY from the environment — the standard
# OpenRouter/promptfoo variable. The key is NEVER hardcoded, printed, or committed.
#
# For local convenience, sources a gitignored .env at the package root if present (see
# .env.example) before checking the variable — so this pre-check doesn't false-negative on a
# freshly-populated .env in the same run. promptfoo also auto-loads .env on its own; sourcing
# here just makes run.sh's own check see it too.
#
# Uses the `promptfoo` binary from this package's OWN node_modules/.bin (a real, lockfile-
# pinned devDependency — see package.json and PLAN.md "Q-B") rather than `npx promptfoo@X`,
# which only pins the top-level version, not promptfoo's own transitive tree. `pnpm run`
# puts node_modules/.bin on PATH for the whole script chain, so plain `promptfoo` here
# resolves to that pinned install — run `pnpm install` in this directory first.
#
# Usage: scripts/run.sh <promptfooconfig.yaml> [extra promptfoo eval args...]
# Called by the package.json scripts (dryrun/smoke/eval/eval:judge) — see README.md for the
# full list and what each costs.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$#" -lt 1 ]; then
  echo "usage: scripts/run.sh <config.yaml> [extra promptfoo args...]" >&2
  exit 1
fi
CONFIG="$1"
shift

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# promptfoo's `echo` provider (used by `pnpm run dryrun`) needs no API key at all — skip the
# check entirely for that path so the wiring can be validated with zero setup.
if [ "${OPENROUTER_API_KEY:-}" = "" ] && [[ "$*" != *"--filter-providers echo"* ]]; then
  echo "error: OPENROUTER_API_KEY is not set." >&2
  echo "  Set it in your environment, or copy .env.example to .env and fill it in." >&2
  echo "  Get a key at https://openrouter.ai/keys" >&2
  exit 1
fi

promptfoo eval -c "$CONFIG" "$@"
