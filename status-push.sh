#!/usr/bin/env bash
# 현재 작업 상태를 백엔드 /status 로 POST → 안경이 실시간으로 봄.
# Claude Code 훅(Stop 등)이나 수동으로 호출.
#
# 환경변수:
#   STATUS_ENDPOINT   예) http://localhost:8787/status  또는  https://<worker>/status
#   STATUS_WRITE_KEY  (선택) Worker/보호된 서버면 필요
# 환경변수 STATUS_ENDPOINT 가 없으면 조용히 아무것도 안 함(어떤 세션에서도 안전).
#
# 사용:
#   ./status-push.sh --state running --headline "테스트 실행 중" --step 3/5
#   ./status-push.sh --state waiting --headline "입력 필요" --need
set -euo pipefail
[ -z "${STATUS_ENDPOINT:-}" ] && exit 0
command -v curl >/dev/null 2>&1 || exit 0

state="running"; headline=""; task=""; step=""; need="false"
session="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo session)"
while [ $# -gt 0 ]; do
  case "$1" in
    --state) state="$2"; shift 2;;
    --headline) headline="$2"; shift 2;;
    --task) task="$2"; shift 2;;
    --step) step="$2"; shift 2;;
    --session) session="$2"; shift 2;;
    --need) need="true"; shift;;
    *) shift;;
  esac
done
cur=0; tot=0
[ -n "$step" ] && { cur="${step%%/*}"; tot="${step##*/}"; }

esc(){ printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
payload=$(cat <<EOF
{"session":"$(esc "$session")","state":"$(esc "$state")","headline":"$(esc "$headline")","task":"$(esc "$task")","step":{"current":${cur:-0},"total":${tot:-0}},"needsInput":${need}}
EOF
)
curl -fsS --max-time 5 -X POST "$STATUS_ENDPOINT" \
  -H "Content-Type: application/json" \
  ${STATUS_WRITE_KEY:+-H "x-write-key: $STATUS_WRITE_KEY"} \
  -d "$payload" >/dev/null 2>&1 || true
