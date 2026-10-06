#!/bin/sh
# Usage: scripts/build-csp.sh [hashes]
#   (no arg)  build with the default CSP ('unsafe-inline')
#   hashes    build, derive sha256 hashes of the inline scripts, rebuild with the strict hash-based CSP
# Then restarts `next start` on :3101 and prints the served header.
pkill -f "next start" 2>/dev/null
if [ "$1" = "hashes" ]; then
  pnpm build >/dev/null 2>&1 || { echo build failed; exit 1; }
  SPIKE_SCRIPT_SRC="$(node scripts/csp-hashes.mjs)" pnpm build >/dev/null 2>&1 || { echo build2 failed; exit 1; }
else
  pnpm build >/dev/null 2>&1 || { echo build failed; exit 1; }
fi
nohup pnpm exec next start -p 3101 >/dev/null 2>&1 &
sleep 4
curl -sI localhost:3101/ | grep -i content-security
