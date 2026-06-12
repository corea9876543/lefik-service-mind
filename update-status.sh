#!/usr/bin/env bash
# Claude 세션 상태를 status.json 으로 기록한다.
# monitor.html 이 이 파일을 폴링해서 폰/레이밴 디스플레이에 보여준다.
#
# 사용 예:
#   ./update-status.sh --state running --headline "빌드 통과" --task "테스트 실행" --step 3/5
#   ./update-status.sh --state waiting --headline "입력 필요" --need
#   ./update-status.sh --state done    --headline "작업 완료"
#
# 옵션:
#   --state    running|waiting|done|error  (기본: running)
#   --headline "한 줄 요약"
#   --task     "세부 작업명"
#   --step     현재/전체  (예: 3/5)
#   --session  세션 이름   (기본: 현재 git 브랜치)
#   --need     입력 대기 플래그 on
#   --push     기록 후 git commit & push (GitHub Pages 갱신용)
set -euo pipefail
cd "$(dirname "$0")"

state="running"; headline=""; task=""; step=""; need="false"; push="false"
session="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo session)"

while [ $# -gt 0 ]; do
  case "$1" in
    --state)    state="$2"; shift 2;;
    --headline) headline="$2"; shift 2;;
    --task)     task="$2"; shift 2;;
    --step)     step="$2"; shift 2;;
    --session)  session="$2"; shift 2;;
    --need)     need="true"; shift;;
    --push)     push="true"; shift;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

cur=0; tot=0
if [ -n "$step" ]; then cur="${step%%/*}"; tot="${step##*/}"; fi
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# JSON 안전하게 출력 (jq 있으면 사용, 없으면 수동 이스케이프)
esc(){ printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
cat > status.json <<EOF
{
  "session": "$(esc "$session")",
  "state": "$(esc "$state")",
  "headline": "$(esc "$headline")",
  "task": "$(esc "$task")",
  "step": { "current": ${cur:-0}, "total": ${tot:-0} },
  "needsInput": ${need},
  "updatedAt": "${now}"
}
EOF

echo "status.json updated: [$state] $headline ${step:+($step)}"

if [ "$push" = "true" ]; then
  git add status.json
  git commit -m "chore: update session status [$state]" >/dev/null 2>&1 || true
  git push -u origin "$session" >/dev/null 2>&1 && echo "pushed to origin/$session"
fi
