#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
memory_root="${SIA_MEMORY_ROOT:?SIA_MEMORY_ROOT is required}"
node "$script_dir/../record-event.mjs" post-tool "$memory_root" claude-code "${1:-}" "${2:-0}"
if [[ "${2:-0}" != "0" ]]; then
  node "$script_dir/../record-event.mjs" error "$memory_root" claude-code "${1:-}" "${2:-0}"
fi
