#!/usr/bin/env bash
# Claude Code status push hook v2.
# PHI is prohibited: never include patient names or individual care information.
# Korean payload text must remain in UTF-8 files or the Python literals below.
# Usage: glasses-status.sh --state running
#        glasses-status.sh --state waiting --need
set -u

ENDPOINT="https://claude-glasses-ask.yongyongyo.workers.dev/status"
KEY_FILE="$HOME/.claude/.status-write-key"
QUESTION_FILE="$HOME/.claude/glasses-question.json"

[ -r "$KEY_FILE" ] || exit 0
command -v curl >/dev/null 2>&1 || exit 0
KEY="$(tr -d '\r\n' < "$KEY_FILE")"
[ -n "$KEY" ] || exit 0

PY=""
command -v python >/dev/null 2>&1 && PY=python
[ -z "$PY" ] && command -v python3 >/dev/null 2>&1 && PY=python3
[ -z "$PY" ] && exit 0

STATE="running"
NEED="false"
while [ $# -gt 0 ]; do
  case "$1" in
    --state) STATE="${2:-running}"; shift 2 ;;
    --need) NEED="true"; shift ;;
    *) shift ;;
  esac
done

SESSION="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
[ -n "$SESSION" ] || SESSION="$(basename "$PWD" 2>/dev/null || echo session)"

STATE="$STATE" NEED="$NEED" SESSION="$SESSION" QUESTION_FILE="$QUESTION_FILE" PYTHONUTF8=1 "$PY" - <<'PY' | \
  curl -fsS --max-time 5 -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" -H "x-write-key: $KEY" \
    --data-binary @- >/dev/null 2>&1 || true
import datetime
import json
import os
import sys

state = os.environ.get("STATE", "running")
need = os.environ.get("NEED", "false") == "true"
headlines = {
    "running": "작업 중",
    "waiting": "턴 종료 · 입력 대기",
    "done": "작업 완료",
    "error": "오류 발생",
}
payload = {
    "session": os.environ.get("SESSION", "session"),
    "state": state,
    "headline": headlines.get(state, "작업 중"),
    "task": os.path.basename(os.getcwd()),
    "step": {"current": 0, "total": 0},
    "needsInput": need,
}

if state == "waiting" and need:
    try:
        with open(os.environ["QUESTION_FILE"], "r", encoding="utf-8") as source:
            question_file = json.load(source)
        text = question_file.get("text")
        if isinstance(text, str) and text:
            stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            question = {"id": "q-" + stamp, "text": text}
            choices = question_file.get("choices")
            if isinstance(choices, list):
                question["choices"] = choices
            payload["question"] = question
    except (OSError, ValueError, TypeError, KeyError):
        pass

sys.stdout.write(json.dumps(payload, ensure_ascii=False))
PY
exit 0
