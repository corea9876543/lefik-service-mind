#!/usr/bin/env bash
# 경로 B 큐의 질문에 답을 써넣는다. ask 페이지가 GET /inbox/:id 로 폴링해 받아간다.
#   ./answer-inbox.sh q_abc123 "여기에 답"
#   ./answer-inbox.sh q_abc123 "답" --push   # GitHub Pages 정적 호스팅이면 push로 갱신
set -euo pipefail
cd "$(dirname "$0")"

id="${1:-}"; answer="${2:-}"; push="${3:-}"
[ -z "$id" ] || [ -z "$answer" ] && { echo "usage: ./answer-inbox.sh <id> <answer> [--push]" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq 필요" >&2; exit 1; }

tmp="$(mktemp)"
jq --arg id "$id" --arg a "$answer" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  'map(if .id==$id then .answer=$a | .status="answered" | .answeredAt=$t else . end)' \
  inbox.json > "$tmp" && mv "$tmp" inbox.json

echo "answered: $id"

if [ "$push" = "--push" ]; then
  branch="$(git rev-parse --abbrev-ref HEAD)"
  git add inbox.json
  git commit -m "chore: answer inbox $id" >/dev/null 2>&1 || true
  git push -u origin "$branch" >/dev/null 2>&1 && echo "pushed"
fi
