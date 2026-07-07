#!/usr/bin/env bash
# Local CI gate (Stop hook): mirror the "Type Check" and "Test" CI jobs so they
# always run before Claude finishes a turn. Blocks the stop with the failure
# output so it gets fixed instead of shipped.
#
# Runs at turn-end (not per-edit) because `astro check` + the full test suite are
# too heavy to run on every file write. Skips instantly when there are no source
# changes to verify.
set -uo pipefail

# Resolve repo root from this script's own location — CWD-independent.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

input="$(cat)"

# Prevent infinite loops: if this stop was already triggered by a stop hook, let it stop.
if [ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ]; then
  exit 0
fi

# Only run when there is source to verify (keeps chat-only turns instant).
if [ -z "$(git status --porcelain -- packages playground 2>/dev/null)" ]; then
  exit 0
fi

report=""

# Type Check — mirrors CI: `bunx astro check` (working-directory: playground)
if ! tc_out="$(cd "$PROJECT_DIR/playground" && bunx astro check 2>&1)"; then
  report+=$'\n\n## Type Check (astro check) failed\n'"$(printf '%s' "$tc_out" | tail -40)"
fi

# Tests (TDD) — mirrors CI: `bun run test`
if ! ts_out="$(bun run test 2>&1)"; then
  report+=$'\n\n## Tests failed\n'"$(printf '%s' "$ts_out" | tail -40)"
fi

# Block the stop when either gate fails so Claude fixes it before finishing.
if [ -n "$report" ]; then
  jq -Rn --arg r "Local CI gate failed — fix before finishing:${report}" \
    '{decision: "block", reason: $r}'
fi

exit 0
