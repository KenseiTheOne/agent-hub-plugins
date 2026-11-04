#!/usr/bin/env bash
# Проверка реестра: один вход для CI и автора. Все ключи — как у scripts/check.mjs:
#   scripts/check.sh                          — всё, без диффа прав
#   scripts/check.sh --base origin/main       — плюс дифф прав с main
#   scripts/check.sh --only my-plugin         — один плагин
# NODE_OPTIONS убирается: preload-хуки (например, cmux) роняют дочерние node.
set -euo pipefail
cd "$(dirname "$0")/.."
unset NODE_OPTIONS
node scripts/check.mjs "$@"
