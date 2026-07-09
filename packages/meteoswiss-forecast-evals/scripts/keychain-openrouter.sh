#!/usr/bin/env bash
# Prints the OpenRouter API key from the macOS keychain to stdout. Never echoes it to logs —
# callers must capture it directly (see scripts/run.sh) and must NOT `set -x` around this.
#
# Per Max: the key is stored keyed by SERVICE (not account), so the repo's general
# scripts/keychain-get.sh (which looks up by account) will NOT find it — this exact command
# is required:
set -euo pipefail
security find-generic-password -s OPENROUTER_API_KEY_EVALS -w
