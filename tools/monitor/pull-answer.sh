#!/usr/bin/env bash
# Pop one glasses answer, or wait until one arrives with --watch.
set -u
set -o pipefail

BASE="https://claude-glasses-ask.yongyongyo.workers.dev"
KEY_FILE="$HOME/.claude/.status-write-key"
WATCH="false"
[ "${1:-}" = "--watch" ] && WATCH="true"

if [ ! -r "$KEY_FILE" ]; then
  echo "missing key: $KEY_FILE" >&2
  exit 1
fi
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }
PY=""
command -v python >/dev/null 2>&1 && PY=python
[ -z "$PY" ] && command -v python3 >/dev/null 2>&1 && PY=python3
[ -n "$PY" ] || { echo "python is required" >&2; exit 1; }
KEY="$(tr -d '\r\n' < "$KEY_FILE")"
[ -n "$KEY" ] || { echo "empty key: $KEY_FILE" >&2; exit 1; }

pop_once() {
  curl -fsS --max-time 10 -X POST "$BASE/inbox/pop" \
    -H "Content-Type: application/json" -H "x-write-key: $KEY" \
    --data-binary '{"queue":"to-claude"}' | \
  PYTHONUTF8=1 "$PY" -c '
import json
import os
import sys

try:
    response = json.load(sys.stdin)
    item = response.get("item")
    if not item:
        raise SystemExit(1)
    payload = item.get("payload") or {}
    line = "[glasses-answer] session={} qid={} answer={}".format(
        payload.get("sessionId", ""),
        payload.get("questionId", ""),
        payload.get("answer", ""),
    )
    with open(os.path.expanduser("~/.claude/glasses-answers.log"), "a", encoding="utf-8", newline="\n") as log:
        log.write(line + "\n")
    print(line)
except (OSError, ValueError, TypeError, AttributeError) as error:
    print("invalid inbox response: {}".format(error), file=sys.stderr)
    raise SystemExit(2)
'
}

while true; do
  pop_once
  RESULT=$?
  [ "$RESULT" -eq 0 ] && exit 0
  if [ "$RESULT" -ne 1 ]; then
    echo "failed to pull answer" >&2
    exit 1
  fi
  if [ "$WATCH" != "true" ]; then
    echo "no answer"
    exit 1
  fi
  sleep 5
done
