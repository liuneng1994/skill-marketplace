#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
memory_root="${SIA_MEMORY_ROOT:?SIA_MEMORY_ROOT is required}"
node "$script_dir/../record-event.mjs" pre-tool "$memory_root" claude-code "${1:-unknown}" "${2:-}"
