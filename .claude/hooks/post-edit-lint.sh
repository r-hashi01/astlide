#!/usr/bin/env bash
set -euo pipefail

# Resolve the repo root from this script's own location so the hook works
# regardless of the caller's CWD (cmux, herdr, CI, direct invocation, …).
# `bunx biome` and biome.json discovery both depend on running at the root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

input="$(cat)"
file="$(jq -r '.tool_input.file_path // .tool_input.path // empty' <<< "$input")"

# Biome対象の拡張子のみ処理
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.css) ;;
  *) exit 0 ;;
esac

# 自動修正を先に実行
bunx biome check --fix --files-ignore-unknown=true "$file" >/dev/null 2>&1 || true

# 残った違反をClaudeにフィードバック
diag="$(bunx biome check "$file" 2>&1 | head -30)" || true

if [ -n "$diag" ]; then
  jq -Rn --arg msg "$diag" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $msg
    }
  }'
fi
