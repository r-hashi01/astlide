#!/usr/bin/env bash
set -euo pipefail

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
