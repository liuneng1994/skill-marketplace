#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
memory_root="${SIA_MEMORY_ROOT:?SIA_MEMORY_ROOT is required}"
node "$script_dir/../record-event.mjs" session-end "$memory_root" claude-code '{}'
node "$script_dir/../analyze-session.mjs" "$memory_root" claude-code hook-session-end >/dev/null
