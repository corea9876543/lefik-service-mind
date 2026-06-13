#!/usr/bin/env bash
# 경로 B 큐(inbox.json)에서 아직 답하지 않은 질문을 보여준다.
# 작업 중인 Claude Code 세션이 이걸로 안경에서 온 질문을 확인한다.
#   ./read-inbox.sh           # pending 질문 목록
#   ./read-inbox.sh --all     # 전체(답변 포함)
set -euo pipefail
cd "$(dirname "$0")"

filter='map(select(.status=="pending"))'
[ "${1:-}" = "--all" ] && filter='.'

if command -v jq >/dev/null 2>&1; then
  jq -r "${filter} | .[] | \"[\(.status)] \(.id)  \(.createdAt)\n  Q: \(.question)\(if .answer then \"\n  A: \"+.answer else \"\" end)\n\"" inbox.json
else
  echo "jq 없음 — 원본 출력:"; cat inbox.json
fi
