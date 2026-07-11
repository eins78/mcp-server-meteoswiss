#!/bin/bash
# Runs the promptfoo viewer over the local ~/.promptfoo results DB, and (re)asserts the
# tailnet-private Tailscale serve mapping that exposes it. Launched by
# li.kiste.meteoswiss-evals-viewer.plist (which sets WorkingDirectory + PATH — see README
# "Live viewer" section). To run manually, cd into this package first.
set -euo pipefail

PORT=15500

# tailscaled is a system daemon: it holds the specific-address bind on $PORT for as long as the
# `serve` mapping exists, independent of whether the backend (this viewer) is actually reachable
# — killing/restarting the viewer does NOT release tailscaled's bind. It also restores this
# mapping from its own persisted state, independently of (and before) this LaunchAgent, so it can
# already hold the port on a fresh boot too. promptfoo's viewer binds the wildcard address
# (0.0.0.0:$PORT, no flag to restrict it), and a wildcard bind fails with EADDRINUSE whenever a
# specific-address bind on that port already exists — so the mapping must always be cleared
# first, on every start, not just after a reboot. (Tried skipping this when the existing mapping
# already pointed at the right target — still hit EADDRINUSE, because tailscaled's bind doesn't
# care whether the backend is up. Confirmed by testing, not just re-derived.)
tailscale serve --https="$PORT" off >/dev/null 2>&1 || true

# `-n`: skip confirmation, do NOT auto-open a browser — this runs headless under launchd.
./node_modules/.bin/promptfoo view --port "$PORT" -n &
viewer_pid=$!

# Only (re)assert the mapping once the viewer has actually bound the port — reapplying `serve`
# before that would just recreate the EADDRINUSE race above.
for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break
  sleep 1
done

tailscale serve --bg --https="$PORT" "http://127.0.0.1:$PORT" >/dev/null

# Block here so launchd supervises this script's lifetime against the viewer's — when the
# viewer exits (crash or otherwise), this script exits too and KeepAlive restarts the whole
# sequence, including the defensive clear above.
wait "$viewer_pid"
