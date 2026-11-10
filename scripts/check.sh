#!/usr/bin/env bash
# Registry check: one entry point for CI and authors. Flags are the same as scripts/check.mjs:
#   scripts/check.sh                          — everything, no permission diff
#   scripts/check.sh --base origin/main       — plus the permission diff against main
#   scripts/check.sh --only my-plugin         — one plugin
# NODE_OPTIONS is unset: preload hooks (cmux, for example) crash child node processes.
set -euo pipefail
cd "$(dirname "$0")/.."
unset NODE_OPTIONS
node scripts/check.mjs "$@"
