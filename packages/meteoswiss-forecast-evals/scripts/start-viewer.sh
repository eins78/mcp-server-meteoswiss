#!/bin/bash
# Runs the promptfoo viewer over the local ~/.promptfoo results DB, and (re)asserts the
# tailnet-private Tailscale serve mapping that exposes it. Launched by
# li.kiste.meteoswiss-evals-viewer.plist (see README "Live viewer" section).
set -euo pipefail

PORT=15500
PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/opt/homebrew/bin:$PATH"

cd "$PACKAGE_DIR"

# tailscaled is a system daemon and restores its persisted `serve` config independently — it can
# (and after a reboot, will) already hold a specific-address bind on $PORT before this LaunchAgent
# gets a chance to run. promptfoo's viewer binds the wildcard address (0.0.0.0:$PORT), and a
# wildcard bind fails with EADDRINUSE if a specific-address bind on that port already exists.
# Clear any stale mapping first — safe no-op if nothing was mapped.
tailscale serve --https="$PORT" off >/dev/null 2>&1 || true

# `-n`: skip confirmation, do NOT auto-open a browser — this runs headless under launchd.
./node_modules/.bin/promptfoo view --port "$PORT" -n &
viewer_pid=$!

# Only (re)assert the tailnet mapping once the viewer has actually bound the port — reapplying
# `serve` before that would just recreate the EADDRINUSE race above.
for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break
  sleep 1
done

tailscale serve --bg --https="$PORT" "http://127.0.0.1:$PORT" >/dev/null

# Block here so launchd supervises this script's lifetime against the viewer's — when the
# viewer exits (crash or otherwise), this script exits too and KeepAlive restarts the whole
# sequence, including the defensive `serve off` above.
wait "$viewer_pid"
