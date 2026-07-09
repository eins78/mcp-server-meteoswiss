#!/usr/bin/env bash
# Run a promptfoo eval config, reading OPENROUTER_API_KEY from the macOS keychain at runtime.
# The key is NEVER hardcoded, printed, or committed — see scripts/keychain-openrouter.sh.
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

# promptfoo's `echo` provider (used by `pnpm run dryrun`) needs no API key at all — skip the
# keychain lookup entirely for that path so the wiring can be validated with zero setup.
if [ "${OPENROUTER_API_KEY:-}" = "" ] && [[ "$*" != *"--filter-providers echo"* ]]; then
  if ! OPENROUTER_API_KEY="$(bash scripts/keychain-openrouter.sh 2>/dev/null)"; then
    echo "error: OPENROUTER_API_KEY not set and not found in keychain (service OPENROUTER_API_KEY_EVALS)." >&2
    echo "  Set it with: security add-generic-password -s OPENROUTER_API_KEY_EVALS -a <account> -w <key>" >&2
    exit 1
  fi
  export OPENROUTER_API_KEY
fi

npx --yes promptfoo@0.121.18 eval -c "$CONFIG" "$@"
